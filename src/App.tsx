import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Indicator } from "./components/Indicator";
import MainPanel from "./components/MainPanel/MainPanel";
import { useJson } from "./hooks/use-json";
import { ConvFilter, ConvMessage, Creation, Setting, SettingKey } from "./types";
import { ConvContext } from "./context/ConvContext";
import { ConvFilterContext } from "./context/ConvFilterContext";
import { useDownload } from "./hooks/use-download";
import { Button, Notification, Toast, Typography } from "@douyinfe/semi-ui-19";
import ProgressModal from "./components/ProgressModal";
import { db, SettingService } from "./db";
import SettingModal from "./components/SettingModal";
import { SettingContext } from "./context/SettingContext";
import { useLiveQuery } from "dexie-react-hooks";
import { buildFileName, buildFolderName, buildZipName, uniqueName } from "./utils/common";
import { getVideoUrl } from "@/api/video";
import { matchesShortcut } from "@/utils/shortcut";
import { filterConvsByMediaType } from "@/utils/media-filter";
import { filterDeletedConvs } from "@/utils/deleted-media";
import { getSourceDownloadUrl } from "@/utils/video-url";
import { useDeletedMediaKeys } from "@/hooks/use-deleted-media-keys";
import { getCurrentConvId, matchesConvScope } from "@/utils/conv-filter";
import { loadConversationHistory } from "@/utils/load-history";
import { HistoryContext } from "@/context/HistoryContext";

function settingValue<T>(settings: Setting[], key: SettingKey, fallback: T): T {
  return (settings.find((item) => item.key === key)?.value as T | undefined) ?? fallback;
}

function App() {
  const [isOpenMainPanel, setIsOpenMainPanel] = useState(false);
  const [isOpenSetting, setIsOpenSetting] = useState(false);
  const [convMessageList, setConvMessageList] = useState<ConvMessage[]>([]);
  const [selectKeys, setSelectKeys] = useState<string[]>([]);
  const [convFilter, setConvFilter] = useState<ConvFilter>({
    showConvId: "-1",
    currentPage: 1,
    pageSize: 12,
    mediaType: "all",
  });
  const deletedKeys = useDeletedMediaKeys();
  const setting =
    useLiveQuery(() => db.setting.toArray(), []) || ([] as Setting[]);
  const showCaptureNotification = settingValue(setting, "show_capture_notification", true);
  const hideIndicator = settingValue(setting, "hide_indicator", false);
  const panelShortcut = settingValue(setting, "panel_shortcut", "Alt + D");
  const historyLoaderRef = useRef<AbortController | undefined>(undefined);
  const showCaptureNotificationRef = useRef(showCaptureNotification);
  showCaptureNotificationRef.current = showCaptureNotification;

  const { Text } = Typography;

  useEffect(() => {
    Notification.config({
      position: "bottomRight",
    });
    const settingService = new SettingService();
    settingService.initDB().catch((err) => {
      console.error(`init db error: `, err);
      Notification.error({
        title: "数据库异常",
        content: (
          <Typography>
            <Text>初始化数据库失败,请在IndexedDB中删除DouBao-Downloader后刷新页面重试</Text>
            <br />
            <br />
            <Button theme="solid" onClick={() => {
              settingService.reStoreDatabase().then(() => {
                Toast.success("数据库已重置,3秒后自动刷新页面");
                setTimeout(() => {
                  window.location.reload();
                }, 3000);
              }).catch((err) => {
                Toast.error("数据库重置失败,请在控制台查看详细错误");
                console.error(`reStoreDatabase error: `, err);
              });
            }} type="danger">
              点击重置数据库(这可能会导致资源下载记录丢失)
            </Button>
          </Typography>
        ),
        duration: 0,
        position: "bottomRight",
      });
    })
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, panelShortcut)) {
        event.preventDefault();
        setIsOpenMainPanel((isOpen) => !isOpen);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelShortcut]);

  const { download, cancel, progress, isDownloading } = useDownload();

  const updateSetting = useCallback((item: Setting) => {
    db.setting
      .update(item.id, {
        key: item.key,
        value: item.value,
      })
      .then((e) => {
        !e && Toast.error("设置失败");
      });
  }, []);

  const handleUpdateVideoDurationSuccess = useCallback(() => {
    Toast.success("已将视频生成时长修改为15秒");
  }, []);

  const handleUpdateVideoDurationError = useCallback((error: unknown) => {
    Toast.error("修改视频生成时长失败，请在控制台查看详细错误");
    console.error("updateVideoDuration error:", error);
  }, []);

  useJson({
    // 设置加载完成前为 undefined，钩子沿用上次缓存的值
    showRaw: setting.find((item: Setting) => item.key === "show_raw")?.value,
    enable15sVideo:
      setting.find((item: Setting) => item.key === "enable_15s_video")?.value,
    onUpdateVideoDurationSuccess: handleUpdateVideoDurationSuccess,
    onUpdateVideoDurationError: handleUpdateVideoDurationError,
    callback: (convMessages: ConvMessage[]) => {
      setConvMessageList((prev) => {
        const seen = new Set(prev.map((existing) => `${existing.source}|${existing.message_id}`));
        const newConv = convMessages.filter(
          (message) => !seen.has(`${message.source}|${message.message_id}`),
        );
        if (newConv.length === 0) return prev;
        const newImageCount = newConv.filter(
          (message) =>
            message?.creation?.creation_type === "image"
        ).length;
        const newVideoCount = newConv.filter(
          (message) =>
            message?.creation?.creation_type === "video"
        ).length;
        if (newImageCount === 0 && newVideoCount === 0) return prev;
        const content = `捕获到: ${newImageCount > 0 ? '图片[' + newImageCount + ']张' : ''} ${newVideoCount > 0 ? '视频[' + newVideoCount + ']个' : ''}`;
        // 加载历史时每批都会捕获到新媒体，逐批弹通知会堆满屏幕，结束后统一提示
        if (showCaptureNotificationRef.current && !historyLoaderRef.current) {
          Notification.info({
            title: "豆包下载器",
            content: (
              <>
                <div>
                  {
                    content
                  }
                  <Typography.Text link onClick={() => handleDownload(newConv)}>
                    点击此处一键下载
                  </Typography.Text>
                  。<br />
                  你也可以点击屏幕右侧豆包头像打开面板查看！
                </div>
              </>
            ),
            duration: 10,
            showClose: true,
            position: "bottomRight",
          });
        }
        return [...prev, ...newConv];
      });
    },
  });

  const [currentConvId, setCurrentConvId] = useState<string>();
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  // 已经自动加载过历史的会话，再次打开面板时不重复加载
  const autoLoadedConvIds = useRef(new Set<string>());
  const mediaCountRef = useRef(0);
  mediaCountRef.current = convMessageList.filter((conv) => conv.creation).length;

  const startLoadHistory = useCallback(async (convId: string) => {
    historyLoaderRef.current?.abort();
    const controller = new AbortController();
    historyLoaderRef.current = controller;
    autoLoadedConvIds.current.add(convId);
    setIsLoadingHistory(true);
    const before = mediaCountRef.current;
    const result = await loadConversationHistory({
      signal: controller.signal,
      getCapturedCount: () => mediaCountRef.current,
      keepGoing: () => getCurrentConvId() === convId,
    });
    if (historyLoaderRef.current !== controller) return;
    historyLoaderRef.current = undefined;
    setIsLoadingHistory(false);
    if (result === "no-scroller") {
      Toast.warning("没有找到对话的消息列表");
    } else if (result === "done") {
      Toast.success(`已加载到对话开头，新增 ${mediaCountRef.current - before} 个媒体`);
    }
  }, []);

  const toggleLoadHistory = useCallback(() => {
    if (historyLoaderRef.current) {
      historyLoaderRef.current.abort();
      return;
    }
    const convId = getCurrentConvId();
    setCurrentConvId(convId);
    if (!convId) {
      Toast.warning("请先打开一个对话");
      return;
    }
    startLoadHistory(convId);
  }, [startLoadHistory]);

  // 打开面板时按设置自动选中当前会话、加载它更早的消息
  const autoSelectCurrentConvRef = useRef(true);
  autoSelectCurrentConvRef.current = settingValue(setting, "auto_select_current_conv", true);
  const autoLoadHistoryRef = useRef(true);
  autoLoadHistoryRef.current = settingValue(setting, "auto_load_history", true);
  // 用 layout effect 在面板画出来之前切换，避免先闪一下上一个会话的图片
  useLayoutEffect(() => {
    if (!isOpenMainPanel) return;
    const convId = getCurrentConvId();
    setCurrentConvId(convId);
    if (!convId) return;
    if (autoSelectCurrentConvRef.current) {
      setConvFilter((prev) => ({ ...prev, showConvId: convId, currentPage: 1 }));
    }
    if (autoLoadHistoryRef.current && !autoLoadedConvIds.current.has(convId)) {
      startLoadHistory(convId);
    }
  }, [isOpenMainPanel, startLoadHistory]);

  const changeFilter = useCallback(
    (key: keyof ConvFilter, value: string) => {
      setConvFilter((prev) => ({ ...prev, [key]: value }));
    },
    [convFilter],
  );

  const handleDownload = useCallback(
    async (convMessages: ConvMessage[]) => {
      if (isDownloading) {
        Toast.warning("正在下载中，请勿重复下载");
        return;
      }
      if (convMessages.length === 0) {
        Toast.warning("请选择要下载的内容");
        return;
      }
      const downloadedArray =
        setting.find((item) => item.key === 'skip_downloaded')?.value || false
          ? await db.downloaded.toArray()
          : [];
      const downloadedUrl = new Set(downloadedArray.map((item) => item.url));
      const customFilenameTemplate =
        setting.find((item) => item.key === "custom_filename_template")
          ?.value ||
        "${conversation_id}_${message_id}_${index_in_conv}_${creation.image.key}";
      const createFolder =
        setting.find((item) => item.key === "create_folder")?.value || false;
      const downloadByDisplayOrder =
        setting.find((item) => item.key === "download_by_display_order")?.value || false;

      const validConvs = convMessages.filter(
        (conv): conv is ConvMessage & { creation: Creation } =>
          conv.creation != null,
      );

      const displayOrderMap = new Map(
        validConvs.map((conv, index) => [conv.creation.image.key, index + 1]),
      );
      const withDisplayOrder = (
        filename: string,
        conv: ConvMessage & { creation: Creation },
      ) => {
        if (!downloadByDisplayOrder) return filename;
        const order = displayOrderMap.get(conv.creation.image.key);
        return order ? `${order}-${filename}` : filename;
      };
      const usedNames = new Set<string>();
      const toDownloadItem = (
        conv: ConvMessage & { creation: Creation },
        url: string,
        suffix: string,
      ) => {
        const folder = createFolder
          ? buildFolderName(conv.tts_content, conv.conversation_id)
          : "";
        const filename = withDisplayOrder(
          buildFileName(
            customFilenameTemplate,
            conv,
            suffix,
            conv.creation.image.key || conv.message_id,
          ),
          conv,
        );
        return {
          conversation_id: conv.conversation_id,
          message_id: conv.message_id,
          key: conv.creation.image.key.replace(/\//g, "_"),
          url,
          filename: uniqueName(folder + filename, usedNames).slice(folder.length),
          folder,
        };
      };

      const imageConvs = validConvs.filter(
        (conv) => conv.creation.creation_type === "image",
      );
      const videoConvs = validConvs.filter(
        (conv) => conv.creation.creation_type === "video",
      );

      // 解析视频真实下载地址
      const videoResults = await Promise.allSettled(
        videoConvs.map(async (conv) => {
          const videoUrl = await getSourceDownloadUrl(conv);
          return { conv, videoUrl };
        }),
      );

      // 构建图片下载列表。aispace 图片需要先通过 node_id 获取源文件地址。
      const imageResults = await Promise.allSettled(
        imageConvs.map(async (conv) => ({
          conv,
          imageUrl: await getSourceDownloadUrl(conv),
        })),
      );
      const imageDownloads = imageResults
        .filter(
          (result): result is PromiseFulfilledResult<{
            conv: ConvMessage & { creation: Creation };
            imageUrl: string;
          }> => result.status === "fulfilled",
        )
        .filter(({ value }) => !downloadedUrl.has(value.imageUrl))
        .map(({ value: { conv, imageUrl } }) =>
          toDownloadItem(conv, imageUrl, "png"),
        );

      // 构建视频下载列表
      const videoDownloads: typeof imageDownloads = [];
      videoResults.forEach((result) => {
        if (result.status === "fulfilled") {
          const { conv, videoUrl } = result.value;
          if (!downloadedUrl.has(videoUrl)) {
            videoDownloads.push(toDownloadItem(conv, videoUrl, "mp4"));
          }
        }
      });

      // 统计获取失败的视频数量
      const failedVideoCount = videoResults.filter(
        (r) => r.status === "rejected",
      ).length;
      const failedImageCount = imageResults.filter(
        (r) => r.status === "rejected",
      ).length;
      if (failedVideoCount + failedImageCount > 0) {
        Toast.warning(`${failedVideoCount + failedImageCount} 个媒体获取下载地址失败，已跳过`);
      }

      const downloadImages = [...imageDownloads, ...videoDownloads];

      if (downloadImages.length === 0) {
        Toast.warning("没有可下载的内容");
        return;
      }
      // 视频缩略图URL，用于面板展示"已下载"标识
      const fulfilledVideos = videoResults
        .filter((r): r is PromiseFulfilledResult<{ conv: ConvMessage & { creation: Creation }; videoUrl: string }> => r.status === "fulfilled")
        .map((r) => r.value);

      // 只涉及一个会话时，zip 以该会话的ID命名
      const sources = new Set(validConvs.map((conv) => conv.source));
      const convIds = new Set(validConvs.map((conv) => conv.conversation_id));
      let convName: string | undefined;
      if (sources.size === 1 && sources.has("aispace")) {
        convName = "我的创作";
      } else if (convIds.size === 1) {
        [convName] = convIds;
      }

      download(downloadImages, {
        zipName: buildZipName(
          setting.find((item) => item.key === "zip_filename_template")?.value,
          convName,
        ),
        onCancel() {
          Toast.info("已取消下载");
        },
        concurrency: setting.find(
          (item) => item.key === "download_concurrency",
        )?.value || 5,
        onSave(failedUrls) {
          // 下载失败的不记入已下载，否则会被"跳过已下载"永久跳过
          const failed = new Set(failedUrls);
          const savedUrls = downloadImages
            .map((item) => item.url)
            .filter((url) => !failed.has(url));
          const videoThumbnailUrls = fulfilledVideos
            .filter(({ videoUrl }) => !failed.has(videoUrl))
            .map(({ conv }) => conv.creation.image.image_ori_raw.url);
          if (failed.size > 0) {
            Toast.warning(`下载完成，${failed.size} 个失败`);
          } else {
            Toast.success("下载完成");
          }
          db.downloaded.bulkAdd(
            [...savedUrls, ...videoThumbnailUrls].map((url) => ({ url })),
          );
        },
        onError(url, error) {
          Toast.error(`下载失败 ${url}: ${error.message}`);
        },
      });
    },
    [download, isDownloading, setting, convMessageList],
  );

  const handlePlay = useCallback(async (convMessage: ConvMessage) => {
    if (!convMessage.creation.vid) return;
    const playUrl = await getVideoUrl(convMessage.creation.vid)
    if (!playUrl) {
      Toast.error("获取视频播放地址失败");
      return;
    };
    window.open(playUrl, "_blank");
  }, [download, isDownloading, setting])

  const handleDelete = useCallback(async (convMessage: ConvMessage) => {
    const key = convMessage.creation?.image.key;
    if (!key) return;
    const existing = await db.deleted.where("key").equals(key).first();
    if (!existing) await db.deleted.add({ key });
    setSelectKeys((prev) => prev.filter((item) => item !== key));
    Toast.success("已从面板移除");
  }, []);

  const handleDownloadAll = useCallback(() => {
    const selectConv = convFilter.showConvId;
    const scopedConvs = convMessageList.filter((conv) => {
      if (!conv.creation || !matchesConvScope(conv, selectConv)) return false;
      if (convFilter.startTime && conv.create_time < convFilter.startTime) return false;
      if (convFilter.endTime && conv.create_time > convFilter.endTime) return false;
      return true;
    });
    const visibleConvs = filterDeletedConvs(scopedConvs, deletedKeys);
    const downloadConv = filterConvsByMediaType(visibleConvs, convFilter.mediaType);
    handleDownload(downloadConv);
  }, [convMessageList, convFilter, deletedKeys, handleDownload]);

  const handleDownloadSelected = useCallback(() => {
    handleDownload(
      selectKeys.map(
        (key) =>
          convMessageList.find((conv) => conv.creation?.image.key === key)!,
      ),
    );
  }, [convMessageList, handleDownload, selectKeys]);

  const handleSelect = useCallback(
    (key: string, checked: boolean) => {
      setSelectKeys((prev) => {
        return checked
          ? prev.includes(key)
            ? prev
            : [...prev, key]
          : prev.filter((item) => item !== key);
      });
    },
    [selectKeys],
  );

  return (
    <div
      id="doubao-downloader"
      className="dd:bg-background dd:text-foreground dd:h-0"
    >
      <Indicator hidden={hideIndicator} onClick={() => setIsOpenMainPanel(!isOpenMainPanel)} />
      <ProgressModal isDownloading={isDownloading} progress={progress} onCancel={cancel} />
      <SettingContext.Provider
        value={{
          setting,
          updateSetting,
        }}
      >
        <SettingModal
          isOpenSetting={isOpenSetting}
          onCloseSetting={() => setIsOpenSetting(false)}
        />
      </SettingContext.Provider>
      <ConvContext.Provider
        value={{
          convMessage: convMessageList,
          selectKeys,
          handleSelect,
          handleDownload,
          handlePlay,
          handleDelete,
          handleDownloadAll,
          handleDownloadSelected,
        }}
      >
        <ConvFilterContext.Provider value={convFilter}>
          <HistoryContext.Provider value={{ currentConvId, isLoadingHistory, toggleLoadHistory }}>
            <MainPanel
              changeConvFilter={changeFilter}
              isOpenMainPanel={isOpenMainPanel}
              onCloseMainPanel={() => setIsOpenMainPanel(false)}
              isOpenSetting={isOpenSetting}
              openSetting={() => setIsOpenSetting(true)}
            />
          </HistoryContext.Provider>
        </ConvFilterContext.Provider>
      </ConvContext.Provider>
    </div>
  );
}

export default App;
