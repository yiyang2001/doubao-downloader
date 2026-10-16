import { Button, Modal, Select, Switch, Toast, Input, InputNumber, Tabs, TabPane } from "@douyinfe/semi-ui-19";
import { IMAGE_SAVE_FORMATS } from "@/utils/image-convert";
import { useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DIRECTORY_CHANGE_EVENT,
  clearDirectory,
  getSavedDirectory,
  pickDirectory,
  supportsDirectoryDownload,
} from "@/utils/directory-download";
import { SettingContext } from "@/context/SettingContext";
import { Setting, SettingKey } from "@/types";
import { SETTING_DEFAULTS } from "@/db";
import useSetting from "@/hooks/use-setting";

interface SettingModalProps {
  isOpenSetting: boolean;
  onCloseSetting: () => void;
}

interface SettingRowProps {
  label?: string;
  description?: string;
  control: ReactNode;
}

function SettingRow({ label, description, control }: SettingRowProps) {
  return (
    <div className="dd:flex dd:items-center dd:justify-between dd:gap-4 dd:border-b dd:border-slate-100 dd:py-3 dd:last:border-b-0">
      <div className="dd:min-w-0 dd:flex-1">
        <div className="dd:text-sm dd:font-medium dd:text-slate-800">{label}</div>
        {description && <div className="dd:mt-1 dd:text-xs dd:text-slate-400">{description}</div>}
      </div>
      <div className="dd:flex dd:max-w-[58%] dd:shrink-0 dd:items-center dd:justify-end">{control}</div>
    </div>
  );
}

function DownloadDirectoryControl() {
  const [directoryName, setDirectoryName] = useState<string>();

  useEffect(() => {
    const refresh = () => {
      getSavedDirectory().then((directory) => setDirectoryName(directory?.name));
    };
    refresh();
    window.addEventListener(DIRECTORY_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(DIRECTORY_CHANGE_EVENT, refresh);
  }, []);

  if (!supportsDirectoryDownload()) {
    return <span className="dd:text-xs dd:text-slate-400">当前浏览器不支持</span>;
  }

  const choose = () => {
    pickDirectory().catch((error) => {
      console.error("pickDirectory error:", error);
      Toast.error("选择文件夹失败，请换一个文件夹（不能直接选「下载」「文档」「桌面」）");
    });
  };

  return (
    <div className="dd:flex dd:min-w-0 dd:items-center dd:gap-2">
      <span className="dd:truncate dd:text-xs dd:text-slate-500" title={directoryName}>
        {directoryName || "未选择"}
      </span>
      <Button onClick={choose} size="small">选择</Button>
      {directoryName && (
        <Button onClick={() => clearDirectory()} size="small" type="tertiary">清除</Button>
      )}
    </div>
  );
}

function SettingModal({ isOpenSetting, onCloseSetting }: SettingModalProps) {
  const { setting, updateSetting } = useContext(SettingContext);

  const getSetting = (key: SettingKey): Setting => {
    const found = setting.find(item => item.key === key);
    if (found) return found;
    const defaultItem = SETTING_DEFAULTS.find(item => item.key === key);
    if (defaultItem) return defaultItem as Setting;
    return { key, label: key, value: null } as Setting;
  };

  const changeSetting = useCallback((item: Setting, value: any) => {
    if (!item) {
      Toast.error("无法获取到设置项");
      return;
    }
    updateSetting({ ...item, value });
  }, [updateSetting]);


  const showRaw = getSetting("show_raw");
  const skipDownloaded = getSetting("skip_downloaded");
  const downloadConcurrency = getSetting("download_concurrency");
  const queueDownloads = getSetting("queue_downloads");
  const batchDownload = getSetting("batch_download");
  const customFilenameTemplate = getSetting("custom_filename_template");
  const zipFilenameTemplate = getSetting("zip_filename_template");
  const createFolder = getSetting("create_folder");
  const convIdSubfolder = getSetting("conv_id_subfolder");
  const imageSaveFormat = getSetting("image_save_format");
  const enable15sVideo = getSetting("enable_15s_video");
  const downloadByDisplayOrder = getSetting("download_by_display_order");
  const showCaptureNotification = getSetting("show_capture_notification");
  const hideIndicator = getSetting("hide_indicator");
  const panelShortcut = getSetting("panel_shortcut");
  const autoSelectCurrentConv = getSetting("auto_select_current_conv");
  const autoLoadHistory = getSetting("auto_load_history");
  const onlyCurrentConv = getSetting("only_current_conv");
  const convLabelById = getSetting("conv_label_by_id");

  const customFilenameTemplateLocal = useSetting(customFilenameTemplate, changeSetting);
  const zipFilenameTemplateLocal = useSetting(zipFilenameTemplate, changeSetting);
  const downloadConcurrencyLocal = useSetting(downloadConcurrency, changeSetting);
  const panelShortcutLocal = useSetting(panelShortcut, changeSetting);


  const handleClose = () => {
    customFilenameTemplateLocal.flush();
    zipFilenameTemplateLocal.flush();
    downloadConcurrencyLocal.flush();
    panelShortcutLocal.flush();
    onCloseSetting();
  };


  return (
    <Modal
      title="设置"
      visible={isOpenSetting}
      onCancel={handleClose}
      footer={null}
      width="min(720px, 94vw)"
      getPopupContainer={() =>
        document.getElementById("dd-modal-popup-container") || document.body
      }
    >
      <div className="dd-setting-modal">
        <Tabs
          className="dd-setting-tabs"
          defaultActiveKey="download"
          tabPosition="left"
          type="button"
        >
          <TabPane itemKey="download" tab="下载行为">
            <div className="dd-setting-content">
              <SettingRow
                control={<Switch checked={showRaw.value} onChange={(checked) => changeSetting(showRaw, checked)} />}
                description="优先展示可直接保存的原始图片"
                label={showRaw.label}
              />
              <SettingRow
                control={<Switch checked={skipDownloaded.value} onChange={(checked) => changeSetting(skipDownloaded, checked)} />}
                description="避免重复处理已经保存过的图片"
                label={skipDownloaded.label}
              />
              <SettingRow
                control={<Switch checked={downloadByDisplayOrder.value} onChange={(checked) => changeSetting(downloadByDisplayOrder, checked)} />}
                description="按当前列表从上到下的顺序写入文件"
                label={downloadByDisplayOrder.label}
              />
              <SettingRow
                control={<Switch aria-label={batchDownload.label} checked={batchDownload.value} onChange={(checked) => changeSetting(batchDownload, checked)} />}
                description="在面板上显示「从当前对话批量下载」：依次加载每个对话的历史并全部下载，然后自动打开侧边栏里的下一个对话"
                label={batchDownload.label}
              />
              <SettingRow
                control={<Switch aria-label={queueDownloads.label} checked={queueDownloads.value} onChange={(checked) => changeSetting(queueDownloads, checked)} />}
                description="下载时不再弹出遮挡操作的进度窗口，进度显示在可拖动的浮窗里（默认右上角）；下载中再点下载会自动排队"
                label={queueDownloads.label}
              />
              <SettingRow
                control={
                  <InputNumber
                    className="dd-setting-number-input"
                    hideButtons
                    max={32}
                    min={1}
                    value={downloadConcurrencyLocal.value as number}
                    onChange={downloadConcurrencyLocal.onChange}
                  />
                }
                description="同时下载的图片数量，范围为 1 到 32"
                label={downloadConcurrency.label}
              />
            </div>
          </TabPane>

          <TabPane itemKey="files" tab="文件与目录">
            <div className="dd-setting-content">
              <SettingRow
                control={<DownloadDirectoryControl />}
                description="选择后不再打包 zip，文件直接保存到该文件夹，已存在的会跳过"
                label="下载文件夹"
              />
              <SettingRow
                control={<Switch aria-label={convIdSubfolder.label} checked={convIdSubfolder.value} onChange={(checked) => changeSetting(convIdSubfolder, checked)} />}
                description="选择了下载文件夹时，每个对话的文件放进以对话ID命名的子文件夹"
                label={convIdSubfolder.label}
              />
              <SettingRow
                control={
                  <Input
                    className="dd-setting-template-input"
                    placeholder="请输入自定义文件名模板，为空则使用默认模板"
                    value={customFilenameTemplateLocal.value}
                    onChange={customFilenameTemplateLocal.onChange}
                  />
                }
                description="支持会话、消息和图片索引等变量"
                label={customFilenameTemplate.label}
              />
              <SettingRow
                control={
                  <Input
                    aria-label={zipFilenameTemplate.label}
                    className="dd-setting-template-input"
                    placeholder="请输入压缩包文件名模板，为空则使用默认模板"
                    value={zipFilenameTemplateLocal.value}
                    onChange={zipFilenameTemplateLocal.onChange}
                  />
                }
                description="支持 ${title}（首条消息）、${conversation_id}、${date}、${time}，无需填写 .zip"
                label={zipFilenameTemplate.label}
              />
              <SettingRow
                control={
                  <Select
                    aria-label={imageSaveFormat.label}
                    optionList={IMAGE_SAVE_FORMATS}
                    style={{ width: 140 }}
                    value={imageSaveFormat.value}
                    onChange={(value) => changeSetting(imageSaveFormat, value)}
                  />
                }
                description="无损 WebP 像素不变、体积约减三成；JPEG 更小但有损。转换会让下载变慢，视频不受影响"
                label={imageSaveFormat.label}
              />
              <SettingRow
                control={<Switch checked={createFolder.value} onChange={(checked) => changeSetting(createFolder, checked)} />}
                description="以会话为单位整理下载文件"
                label={createFolder.label}
              />
            </div>
          </TabPane>

          <TabPane itemKey="video" tab="视频">
            <div className="dd-setting-content">
              <SettingRow
                control={<Switch checked={enable15sVideo.value} onChange={(checked) => changeSetting(enable15sVideo, checked)} />}
                description="在列表中识别并提供 15 秒视频下载"
                label={enable15sVideo.label}
              />
            </div>
          </TabPane>

          <TabPane itemKey="general" tab="通用">
            <div className="dd-setting-content">
              <SettingRow
                control={<Switch aria-label={convLabelById.label} checked={convLabelById.value} onChange={(checked) => changeSetting(convLabelById, checked)} />}
                description="面板的对话下拉框用对话ID代替首条消息来显示每个对话"
                label={convLabelById.label}
              />
              <SettingRow
                control={<Switch aria-label={onlyCurrentConv.label} checked={onlyCurrentConv.value} onChange={(checked) => changeSetting(onlyCurrentConv, checked)} />}
                description="只保留当前所在对话的图片和视频，其它对话和「我的创作」都不捕获；切换对话后会清掉上一个对话的内容"
                label={onlyCurrentConv.label}
              />
              <SettingRow
                control={<Switch aria-label={autoSelectCurrentConv.label} checked={autoSelectCurrentConv.value} onChange={(checked) => changeSetting(autoSelectCurrentConv, checked)} />}
                description="打开面板时把对话筛选切换到当前所在的对话"
                label={autoSelectCurrentConv.label}
              />
              <SettingRow
                control={<Switch aria-label={autoLoadHistory.label} checked={autoLoadHistory.value} onChange={(checked) => changeSetting(autoLoadHistory, checked)} />}
                description="打开面板时自动向上滚动当前对话，捕获更早的图片和视频"
                label={autoLoadHistory.label}
              />
              <SettingRow
                control={<Switch aria-label={showCaptureNotification.label} checked={showCaptureNotification.value} onChange={(checked) => changeSetting(showCaptureNotification, checked)} />}
                description="捕获到新图片或视频时显示通知"
                label={showCaptureNotification.label}
              />
              <SettingRow
                control={<Switch aria-label={hideIndicator.label} checked={hideIndicator.value} onChange={(checked) => changeSetting(hideIndicator, checked)} />}
                description="隐藏屏幕右侧的豆包头像指示器"
                label={hideIndicator.label}
              />
              <SettingRow
                control={
                  <Input
                    aria-label={panelShortcut.label}
                    className="dd-setting-shortcut-input"
                    placeholder="例如 Alt + D"
                    value={panelShortcutLocal.value}
                    onChange={panelShortcutLocal.onChange}
                  />
                }
                description="使用 + 分隔修饰键和按键，留空则停用"
                label={panelShortcut.label}
              />
            </div>
          </TabPane>

        </Tabs>
      </div>
    </Modal>
  );
}

export default SettingModal;
