import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingContext } from "@/context/SettingContext";
import { SETTING_DEFAULTS } from "@/db";
import type { Setting } from "@/types";
import SettingModal from "./SettingModal";

vi.mock("@douyinfe/semi-ui-19", () => ({
  Input: ({ onChange, value }: { onChange?: (value: string) => void; value?: string }) => (
    <input onChange={(event) => onChange?.(event.target.value)} value={value} />
  ),
  InputNumber: ({ value }: { value?: number }) => <input value={value} readOnly />,
  Modal: ({ children, onCancel, visible }: { children: React.ReactNode; onCancel?: () => void; visible: boolean }) =>
    visible ? (
      <div>
        <button onClick={onCancel} type="button">关闭设置</button>
        {children}
      </div>
    ) : null,
  Select: ({ value }: { value?: string }) => <output>{value}</output>,
  Switch: ({ checked, onChange, "aria-label": ariaLabel }: { checked?: boolean; onChange?: (checked: boolean) => void; "aria-label"?: string }) => (
    <input aria-label={ariaLabel} checked={checked} onChange={(event) => onChange?.(event.target.checked)} type="checkbox" />
  ),
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabPane: ({ children, tab }: { children: ReactNode; tab: ReactNode }) => (
    <section>
      <div>{tab}</div>
      {children}
    </section>
  ),
  Toast: { error: vi.fn() },
}));

const settings: Setting[] = [
  { key: "show_raw", value: true, label: "对话列表显示无水印原图" },
  { key: "skip_downloaded", value: true, label: "跳过已下载的图片" },
  { key: "download_concurrency", value: 5, label: "下载图片并发数" },
  { key: "custom_filename_template", value: "template", label: "自定义图片文件名" },
  { key: "zip_filename_template", value: "zip-template", label: "自定义压缩包文件名" },
  { key: "create_folder", value: false, label: "为会话创建文件夹" },
  { key: "enable_15s_video", value: true, label: "开启15秒视频" },
  { key: "download_by_display_order", value: false, label: "按展示顺序下载" },
  { key: "show_capture_notification", value: true, label: "显示捕获通知" },
  { key: "hide_indicator", value: false, label: "隐藏指示器" },
  { key: "panel_shortcut", value: "Alt + D", label: "面板快捷键" },
];

describe("SettingModal", () => {
  it("defaults 15-second video setting to off", () => {
    expect(SETTING_DEFAULTS.find((item) => item.key === "enable_15s_video")?.value).toBe(false);
  });

  it("groups settings into four tabs", () => {
    render(
      <SettingContext.Provider value={{ setting: settings, updateSetting: vi.fn() }}>
        <SettingModal isOpenSetting onCloseSetting={vi.fn()} />
      </SettingContext.Provider>,
    );

    expect(screen.getByText("下载行为")).toBeTruthy();
    expect(screen.getByText("文件与目录")).toBeTruthy();
    expect(screen.getByText("视频")).toBeTruthy();
    expect(screen.getByText("通用")).toBeTruthy();
    expect(screen.queryByText("关于")).toBeNull();
  });

  it("provides defaults for general settings", () => {
    expect(SETTING_DEFAULTS.find((item) => item.key === "show_capture_notification")?.value).toBe(true);
    expect(SETTING_DEFAULTS.find((item) => item.key === "hide_indicator")?.value).toBe(false);
    expect(SETTING_DEFAULTS.find((item) => item.key === "panel_shortcut")?.value).toBe("Alt + D");
    expect(SETTING_DEFAULTS.find((item) => item.key === "auto_select_current_conv")?.value).toBe(true);
    expect(SETTING_DEFAULTS.find((item) => item.key === "auto_load_history")?.value).toBe(true);
    expect(SETTING_DEFAULTS.find((item) => item.key === "conv_id_subfolder")?.value).toBe(true);
    expect(SETTING_DEFAULTS.find((item) => item.key === "image_save_format")?.value).toBe("png");
    expect(SETTING_DEFAULTS.find((item) => item.key === "only_current_conv")?.value).toBe(false);
    expect(SETTING_DEFAULTS.find((item) => item.key === "queue_downloads")?.value).toBe(false);
    expect(SETTING_DEFAULTS.find((item) => item.key === "conv_label_by_id")?.value).toBe(false);
  });

  it("flushes the custom panel shortcut before closing", () => {
    const updateSetting = vi.fn();

    render(
      <SettingContext.Provider value={{ setting: settings, updateSetting }}>
        <SettingModal isOpenSetting onCloseSetting={vi.fn()} />
      </SettingContext.Provider>,
    );

    fireEvent.change(screen.getByDisplayValue("Alt + D"), { target: { value: "Ctrl + Shift + D" } });
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));

    expect(updateSetting).toHaveBeenCalledWith(
      expect.objectContaining({ key: "panel_shortcut", value: "Ctrl + Shift + D" }),
    );
  });

  it("updates the capture notification setting immediately", () => {
    const updateSetting = vi.fn();

    render(
      <SettingContext.Provider value={{ setting: settings, updateSetting }}>
        <SettingModal isOpenSetting onCloseSetting={vi.fn()} />
      </SettingContext.Provider>,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "显示捕获通知" }));

    expect(updateSetting).toHaveBeenCalledWith(
      expect.objectContaining({ key: "show_capture_notification", value: false }),
    );
  });

  it("flushes text input changes before closing", () => {
    const updateSetting = vi.fn();

    render(
      <SettingContext.Provider value={{ setting: settings, updateSetting }}>
        <SettingModal isOpenSetting onCloseSetting={vi.fn()} />
      </SettingContext.Provider>,
    );

    fireEvent.change(screen.getByDisplayValue("template"), { target: { value: "updated-template" } });
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));

    expect(updateSetting).toHaveBeenCalledWith(
      expect.objectContaining({ key: "custom_filename_template", value: "updated-template" }),
    );
  });

  it("flushes the zip filename template before closing", () => {
    const updateSetting = vi.fn();

    render(
      <SettingContext.Provider value={{ setting: settings, updateSetting }}>
        <SettingModal isOpenSetting onCloseSetting={vi.fn()} />
      </SettingContext.Provider>,
    );

    fireEvent.change(screen.getByDisplayValue("zip-template"), { target: { value: "${conversation_id}" } });
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));

    expect(updateSetting).toHaveBeenCalledWith(
      expect.objectContaining({ key: "zip_filename_template", value: "${conversation_id}" }),
    );
  });
});
