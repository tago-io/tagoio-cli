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

export type OtpType = "authenticator" | "sms" | "email";

export interface BackupDownloadRequest {
  password: string;
  otp_type?: OtpType;
  pin_code?: string;
}

export interface BackupDownloadResult {
  url: string;
  size: number;
  size_unit: string;
  file_size_mb: string;
  expire_at: string;
  backup_id: string;
  created_at: string;
}

export interface BackupDownloadResponse {
  status: boolean;
  result: BackupDownloadResult;
}
