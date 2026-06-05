/**
 * API client for the widget (v2).
 */

export interface Comment {
  id: string;
  url: string;
  selector: string | null;
  dom_path: string;
  x_pct: number;
  y_pct: number;
  viewport_w: number;
  viewport_h: number;
  screenshot_key: string | null;
  what: string | null;
  change_text: string;
  why_text: string | null;
  commenter_name: string | null;
  anon_id: string | null;
  site_wide: number; // 0 | 1
  metadata: string | null;
  status: "open" | "in-progress" | "wont-fix" | "resolved";
  created_at: number;
  resolved_at: number | null;
  updated_at?: number | null;
}

export interface Reply {
  id: string;
  comment_id: string;
  author: "client" | "designer" | string;
  body: string;
  anon_id: string | null;
  created_at: number;
}

export interface InferenceInput {
  comment: string;
  why?: string;
  target?: { tag?: string; classes?: string[]; text?: string; description?: string };
  cohortCount?: number;
  isStyleAnchor?: boolean;
  surroundingContext?: string;
}

export interface InferenceOutput {
  refined_target?: string;
  scope: "single" | "cohort" | "global";
  confidence: number;
  clarification?: { question: string; options: string[] };
}

export interface CreateCommentInput {
  url: string;
  selector: string | null;
  dom_path: string;
  x_pct: number;
  y_pct: number;
  viewport_w: number;
  viewport_h: number;
  screenshot_key: string | null;
  what: string;
  change_text: string;
  why_text: string;
  site_wide: boolean;
  metadata?: unknown;
}

export class FeedbackPinApi {
  constructor(private baseUrl: string, private token: string, private uid: string) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "authorization": `Bearer ${this.token}`,
      "x-fp-uid": this.uid,
      ...extra,
    };
  }

  async listComments(url: string, status: "all" | "open" | "in-progress" | "wont-fix" | "resolved" = "open"): Promise<Comment[]> {
    const qs = new URLSearchParams();
    qs.set("url", url);
    if (status !== "all") qs.set("status", status);
    const r = await fetch(`${this.baseUrl}/v1/comments?${qs}`, { headers: this.headers() });
    if (!r.ok) throw new Error(`list failed: ${r.status}`);
    return (await r.json()).comments;
  }

  async createComment(input: CreateCommentInput): Promise<{ id: string }> {
    const r = await fetch(`${this.baseUrl}/v1/comments`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error(await r.text() || `create failed: ${r.status}`);
    return r.json();
  }

  async updateComment(id: string, patch: { change_text?: string; why_text?: string; site_wide?: boolean }): Promise<void> {
    const r = await fetch(`${this.baseUrl}/v1/comments/${id}`, {
      method: "PATCH",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`update failed: ${r.status}`);
  }

  async deleteComment(id: string): Promise<void> {
    const r = await fetch(`${this.baseUrl}/v1/comments/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!r.ok) throw new Error(`delete failed: ${r.status}`);
  }

  async getComment(id: string): Promise<{ comment: Comment; replies: Reply[] }> {
    const r = await fetch(`${this.baseUrl}/v1/comments/${id}`, { headers: this.headers() });
    if (!r.ok) throw new Error(`get failed: ${r.status}`);
    return r.json();
  }

  async reply(id: string, body: string, author: "client" | "designer" = "client"): Promise<{ id: string }> {
    const r = await fetch(`${this.baseUrl}/v1/comments/${id}/replies`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ body, author }),
    });
    if (!r.ok) throw new Error(`reply failed: ${r.status}`);
    return r.json();
  }

  async resolve(id: string): Promise<void> {
    const r = await fetch(`${this.baseUrl}/v1/comments/${id}/resolve`, { method: "POST", headers: this.headers() });
    if (!r.ok) throw new Error(`resolve failed: ${r.status}`);
  }

  async reopen(id: string): Promise<void> {
    const r = await fetch(`${this.baseUrl}/v1/comments/${id}/reopen`, { method: "POST", headers: this.headers() });
    if (!r.ok) throw new Error(`reopen failed: ${r.status}`);
  }

  async setStatus(id: string, status: Comment["status"]): Promise<void> {
    const r = await fetch(`${this.baseUrl}/v1/comments/${id}/status`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ status }),
    });
    if (!r.ok) throw new Error(`status failed: ${r.status}`);
  }

  /**
   * Best-effort intent inference. Returns null if the API has no key configured
   * (503) or the call otherwise fails — callers must fall back to heuristics.
   */
  async inference(input: InferenceInput): Promise<InferenceOutput | null> {
    try {
      const r = await fetch(`${this.baseUrl}/v1/inference`, {
        method: "POST",
        headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify(input),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  async uploadScreenshot(blob: Blob): Promise<{ key: string }> {
    const r = await fetch(`${this.baseUrl}/v1/screenshots`, {
      method: "POST",
      headers: this.headers({ "content-type": blob.type || "image/png" }),
      body: blob,
    });
    if (!r.ok) throw new Error(`screenshot failed: ${r.status}`);
    return r.json();
  }
}
