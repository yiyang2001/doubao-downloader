const MISSING_FIELD = "\u0000";

// ${} 语法
// 支持data多层
// 不存在的字段会连同它前面的分隔符一起去掉，而不是写出 undefined
export const replaceTemplate = (template: string, data: any) => {
  const filled = template.replace(/\${([\w.]+)}/g, (_, key) => {
    let value = data;
    for (const k of key.split(".")) {
      value = value?.[k];
    }
    const isMissing =
      value === undefined ||
      value === null ||
      value === "" ||
      Number.isNaN(value);
    return isMissing ? MISSING_FIELD : String(value);
  });
  return filled.replace(/[_\-. ]?\u0000/g, "").replace(/^[_\-. ]+/, "");
};

export const completeSuffix = (filename: string, suffix: string) => {
  if (!filename.toLowerCase().endsWith(`.${suffix.toLowerCase()}`)) {
    return `${filename}.${suffix}`;
  }
  return filename;
};

const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

// 去掉文件系统不允许的字符并限制长度，结果可能为空字符串
// 浏览器直接写文件夹时比 zip 更严格：不可见的格式字符、首尾的 . ~ 和空格、Windows 保留名都会被拒绝
export const sanitizeFileName = (name: unknown, maxLength = 100) => {
  const cleaned = String(name ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, "")
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, "_");
  const trimmed = Array.from(cleaned.replace(/^[.~ ]+/, ""))
    .slice(0, maxLength)
    .join("")
    .replace(/[.~ ]+$/, "");
  return RESERVED_NAME.test(trimmed) ? `_${trimmed}` : trimmed;
};

export const buildFileName = (
  template: string,
  data: any,
  suffix: string,
  fallback: string,
) => {
  const base =
    sanitizeFileName(replaceTemplate(template, data), 150) ||
    sanitizeFileName(fallback) ||
    "未命名";
  return completeSuffix(base, suffix);
};

export const buildFolderName = (name: unknown, fallback?: string) => {
  return `${sanitizeFileName(name, 50) || sanitizeFileName(fallback, 50) || "未命名"}/`;
};

// 同名文件追加 (2)、(3)...，避免 zip 内文件名冲突
export const uniqueName = (name: string, used: Set<string>) => {
  let candidate = name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    candidate = `${base} (${i})${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

// 默认沿用原来的命名：豆包下载_首条消息_时间
export const DEFAULT_ZIP_NAME_TEMPLATE = "豆包下载_${title}_${time}";

// 模板变量：title（会话首条消息）、conversation_id（下载内容跨多个会话时两者为空）、date、time
export const buildZipName = (
  template: string | undefined,
  conv: { conversation_id?: string; title?: string } = {},
  date = new Date(),
) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const data = {
    conversation_id: conv.conversation_id,
    title: sanitizeFileName(conv.title, 40),
    date: day,
    time: `${day}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  };
  return (
    sanitizeFileName(replaceTemplate(template?.trim() || DEFAULT_ZIP_NAME_TEMPLATE, data), 150) ||
    sanitizeFileName(replaceTemplate(DEFAULT_ZIP_NAME_TEMPLATE, data), 150)
  );
};
