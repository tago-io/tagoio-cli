export interface BackupErrorResponse {
  status: boolean;
  message: string;
}

export interface BackupCreateResponse {
  status: boolean;
  result: string;
}

export interface BackupItem {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  created_at: string;
  file_size?: number;
  error_message?: string;
}

export interface BackupListResponse {
  status: boolean;
  result: BackupItem[];
}

export interface ListOptions {
  page?: number;
  amount?: number;
  orderBy?: string;
  order?: "asc" | "desc";
}
