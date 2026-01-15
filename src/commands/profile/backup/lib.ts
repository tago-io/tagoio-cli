/** Formats bytes into human-readable file size. */
function formatFileSize(bytes?: number): string {
  if (!bytes) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/** Formats ISO date string to localized date and time. */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

/** Handles API errors showing status and message. */
function handleBackupError(error: unknown, fallbackMessage: string): void {
  const { errorHandler } = require("../../../lib/messages");
  const axiosError = error as { response?: { status?: number; data?: { message?: string } }; message?: string };

  if (axiosError.response?.data?.message) {
    const status = axiosError.response.status;
    errorHandler(`[${status}] ${axiosError.response.data.message}`);
    return;
  }

  if (axiosError.message) {
    errorHandler(`${fallbackMessage}: ${axiosError.message}`);
    return;
  }

  errorHandler(fallbackMessage);
}

export { formatDate, formatFileSize, handleBackupError };
