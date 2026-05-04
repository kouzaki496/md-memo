export type NoteMeta = {
  path: string;
  title: string;
  pinned: boolean;
};

export type SearchHit = {
  path: string;
  line: number;
  text: string;
};

export type NoteDetail = {
  path: string;
  title: string;
  pinned: boolean;
  charCount: number;
  updatedMs: number;
  preview: string;
};
