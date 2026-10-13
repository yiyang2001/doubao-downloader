import type { DeletedMedia, Setting } from "@/types";
import Dexie, { type EntityTable } from "dexie";
import { DEFAULT_ZIP_NAME_TEMPLATE } from "@/utils/common";

const DB_NAME = "DouBaoDownloader";

const _old_db = new Dexie(DB_NAME) as Dexie & {
  downloaded: EntityTable<{ id: number; url: string }, 'id'>;
  setting: EntityTable<{ id: number; key: string; value: any }, 'id'>;
};

_old_db.version(1).stores({
  downloaded: "++id, url",
  setting: "id, key, value",
});

export const db = new Dexie(DB_NAME) as Dexie & {
  downloaded: EntityTable<{ id: number; url: string }, "id">;
  setting: EntityTable<Setting, "id">;
  deleted: EntityTable<DeletedMedia, "id">;
};

db.version(2).stores({
  downloaded: "++id, url",
  setting: "++id, &key, value",
});

db.version(3).stores({
  downloaded: "++id, url",
  setting: "++id, &key, value",
  deleted: "++id, &key",
});



export const SETTING_DEFAULTS: Setting[] = [
  {
    key: "show_raw",
    value: true,
    label: "对话列表显示无水印原图",
  },
  {
    key: "skip_downloaded",
    value: true,
    label: "跳过已下载的图片",
  },
  {
    key: "download_concurrency",
    value: 5,
    label: "下载图片并发数",
  },
  {
    key: "custom_filename_template",
    value: '${conversation_id}_${message_id}_${index_in_conv}_${creation.image.key}',
    label: "自定义图片文件名",
  },
  {
    key: "zip_filename_template",
    value: DEFAULT_ZIP_NAME_TEMPLATE,
    label: "自定义压缩包文件名",
  },
  {
    key: "image_save_format",
    value: "png",
    label: "图片保存格式",
  },
  {
    key: "conv_id_subfolder",
    value: true,
    label: "按对话ID建立子文件夹",
  },
  {
    key: "create_folder",
    value: false,
    label: "为会话创建文件夹",
  },
  {
    key: "enable_15s_video",
    value: false,
    label: "开启15秒视频",
  },
  {
    key: "download_by_display_order",
    value: false,
    label: "按展示顺序下载",
  },
  {
    key: "show_capture_notification",
    value: true,
    label: "显示捕获通知",
  },
  {
    key: "hide_indicator",
    value: false,
    label: "隐藏指示器",
  },
  {
    key: "panel_shortcut",
    value: "Alt + D",
    label: "面板快捷键",
  },
  {
    key: "auto_select_current_conv",
    value: true,
    label: "自动选中当前对话",
  },
  {
    key: "auto_load_history",
    value: true,
    label: "自动加载更早的消息",
  },
];

export class SettingService {
  async initDB() {
    for (const { key, value, label } of SETTING_DEFAULTS) {
      const setting = await db.setting.where("key").equals(key).first();
      if (!setting) {
        await db.setting.add({
          key,
          value,
          label
        });
      }
    }
  }


  /**
   * 恢复数据库
   */
  async reStoreDatabase() {
    await _old_db.open();
    const downloadedData = await _old_db.downloaded.toArray();
    _old_db.close();
    await Dexie.delete(DB_NAME);
    await db.open();
    if (downloadedData.length > 0) {
      await db.downloaded.bulkAdd(downloadedData.map((item) => ({ url: item.url })));
    }
    await this.initDB();
  }

}
