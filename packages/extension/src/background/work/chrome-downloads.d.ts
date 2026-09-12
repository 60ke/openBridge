interface WorkDownloadItem {
  id: number; url: string; finalUrl?: string; referrer?: string; startTime: string;
  state: string; filename: string; danger?: string; fileSize?: number; error?: string;
}
interface ChromeApi {
  downloads: {
    download(options: { url: string; saveAs?: boolean; conflictAction?: string }): Promise<number>;
    search(query: { id?: number; startedAfter?: string; limit?: number }): Promise<WorkDownloadItem[]>;
  };
}
