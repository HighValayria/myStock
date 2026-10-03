export interface BaseDoc {
  _id: string;
  _openid: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateMeta {
  _id: string;
  _openid: string;
  schemaVersion: number;
  now: number;
}
