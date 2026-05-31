export type PresentationStatus = {
  active: boolean;
  boundPath: string | null;
  fileName: string;
  url: string;
  realtime: boolean;
};

export type StartPresentationResult = {
  token: string;
  url: string;
  fileName: string;
  boundPath: string | null;
  realtime: boolean;
};
