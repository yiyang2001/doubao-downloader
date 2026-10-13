import { NewVersionData } from "@/types";
import { useEffect, useState } from "react";

export const REPO_URL = "https://github.com/yiyang2001/doubao-downloader";
export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`;
const LATEST_RELEASE_API =
  "https://api.github.com/repos/yiyang2001/doubao-downloader/releases/latest";

const getLatestRelease = async () => {
  const response = await fetch(LATEST_RELEASE_API);
  // 仓库还没有发布过 release 时返回 404
  if (!response.ok) return null;
  const data = await response.json();
  return data;
};

const isNewVersion = (currentVersion: string, latestVersion: string) => {
  const currentVersionParts = currentVersion.split(".");
  const latestVersionParts = latestVersion.split(".");

  for (
    let i = 0;
    i < Math.max(currentVersionParts.length, latestVersionParts.length);
    i++
  ) {
    const currentPart = parseInt(currentVersionParts[i] || "0");
    const latestPart = parseInt(latestVersionParts[i] || "0");
    if (currentPart < latestPart) {
      return true;
    } else if (currentPart > latestPart) {
      return false;
    }
  }
};

export const useCheckVersion = () => {
  const [newVersion, setNewVersion] = useState<NewVersionData>();

  useEffect(() => {
    getLatestRelease()
      .then((data) => {
        if (typeof data?.tag_name !== "string") return;
        const latestVersion = data.tag_name.replace("v", "");
        const isNewVer = isNewVersion(__APP_VERSION__, latestVersion) || false;
        setNewVersion({
          body: data.body,
          isNew: isNewVer,
        });
      })
      .catch((error) => {
        console.error("failed to get latest release", error);
      });
  }, []);

  return { ...newVersion };
};
