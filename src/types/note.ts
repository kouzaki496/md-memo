export type NoteMeta = {
  path: string;
  title: string;
  pinned: boolean;
  systemNote: boolean;
  tags: string[];
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
  systemNote: boolean;
  tags: string[];
  charCount: number;
  updatedMs: number;
  preview: string;
};

export type ReplaceTagGloballyResult = {
  filesChanged: number;
  changedPaths: string[];
  templateTags: string[];
};
