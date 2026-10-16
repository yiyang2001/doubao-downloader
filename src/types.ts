export type SettingKey = "show_raw" | "skip_downloaded" | "download_concurrency" | "custom_filename_template" | "zip_filename_template" | "create_folder" | "enable_15s_video" | "download_by_display_order" | "show_capture_notification" | "hide_indicator" | "panel_shortcut" | "auto_select_current_conv" | "auto_load_history" | "conv_id_subfolder" | "image_save_format" | "only_current_conv" | "queue_downloads" | "conv_label_by_id" | "batch_download";
export type Setting = {
  id?: number;
  key: SettingKey;
  value: any;
  label?: string;
};

export type NewVersionData = {
  body: string;
  isNew: boolean;
};


export type Creation = {
  creation_type: "image" | "video";
  image: {
    image_ori_raw: {
      url: string;
    };
    key: string;
    gen_params: string;
  };
  vid?: string;
  node_id?: string;
};

export type MediaType = "all" | "image" | "video";
export type ConvSource = "conversation" | "aispace";

export type ConvMessage = {
  source?: ConvSource;
  // 索引(1为该对话的第一条消息)
  index_in_conv: number;
  // 回复的消息ID
  bot_reply_message_id: string;
  // 文本内容
  tts_content: string;
  // 会话ID
  conversation_id: string;
  // 消息ID
  message_id: string;
  // 创建时间
  create_time: number;
  creation: Creation;
};

export type DownloadImage = {
  conversation_id: string;
  message_id: string;
  key: string;
  url: string;
  filename: string;
  folder?: string;
  // 下载后要转成的图片格式，不填则原样保存
  format?: "webp" | "jpeg";
};

export type ConvFilter = {
  showConvId: string;
  currentPage: number;
  pageSize: number;
  mediaType: MediaType;
  startTime?: number;
  endTime?: number;
};

export type DeletedMedia = {
  id?: number;
  key: string;
};

declare global {
  const __APP_VERSION__: string;
  const __BUILD_TIME__: string;
  interface Window {
    origin_parse: (data: string) => any;
    origin_stringify: typeof JSON.stringify;
    ZIP: any;
  }
}

interface FileLike {
  name: string;
  lastModified?: number;
  directory?: boolean;
  comment?: string;
  stream?: () => ReadableStream<Uint8Array>;
}

export type ZipWriter = {
  enqueue: (fileLike: FileLike) => void;
  close: () => void;
};
