export type BookInput = {
  relPath: string;
  filename: string;
  title: string;
  author: string | null;
  description: string | null;
  category: string | null;
  coverFilename: string | null;
  sizeBytes: number;
  mtime: number;
};

export type Book = BookInput & {
  id: number;
  addedAt: number;
  indexedAt: number;
};

export type BookWithDownload = Book & {
  downloadedAt: number | null;
};

export type CategoryCount = {
  name: string;
  count: number;
};

export type Device = {
  id: string;
  label: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
};

export type ListOpts = {
  category?: string | null;
  search?: string;
  sort?: "recent" | "title";
  deviceId?: string;
  limit?: number;
};
