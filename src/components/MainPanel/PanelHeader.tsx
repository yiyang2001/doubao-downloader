import { Space, Button, Tag } from "@douyinfe/semi-ui-19";
import {
  IconGithubLogo,
  IconClose,
  IconSetting,
  IconAIFilledLevel1,
} from "@douyinfe/semi-icons";
import { useIsMobile } from "@/hooks/use-mobile";
import ActionCard from "./ActionCard";
import {
  LATEST_RELEASE_URL,
  REPO_URL,
  useCheckVersion,
} from "@/hooks/use-check-version";
import type { MediaCounts } from "@/utils/media-filter";
import type { MediaType } from "@/types";

interface PanelHeaderProps {
  onCloseMainPanel: () => void;
  changeConv: (convId: string) => void;
  changeTimeRange: (startTime?: number, endTime?: number) => void;
  changeMediaType: (mediaType: MediaType) => void;
  mediaCounts: MediaCounts;
  mediaType: MediaType;
  openSetting: () => void;
}

function PanelHeader({
  onCloseMainPanel,
  changeConv,
  changeTimeRange,
  changeMediaType,
  mediaCounts,
  mediaType,
  openSetting,
}: PanelHeaderProps) {
  const isMobile = useIsMobile();
  const { isNew } = useCheckVersion();

  return (
    <div>
      <div className="dd:h-15 dd:w-full dd:flex dd:flex-row dd:items-center dd:justify-between">
        <div className="dd:flex dd:flex-row dd:items-center dd:gap-2">
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>豆包下载器</h3>
          {isNew && (
            <Tag
              className="dd:cursor-pointer"
              colorful
              prefixIcon={<IconAIFilledLevel1 size="small" />}
              type="solid"
              gradient
              onClick={() =>
                window.open(LATEST_RELEASE_URL, "_blank")
              }
            >
              有新版本
            </Tag>
          )}
        </div>
        <div>
          <Space>
            <Button
              theme="outline"
              type="tertiary"
              size="small"
              icon={<IconGithubLogo />}
              onClick={() => window.open(REPO_URL)}
            >
              {isMobile ? "" : "Source Code"}
            </Button>
            <Button
              theme="outline"
              type="tertiary"
              size="small"
              icon={<IconSetting />}
              onClick={() => openSetting()}
            ></Button>
            <Button
              theme="outline"
              type="tertiary"
              size="small"
              icon={<IconClose />}
              onClick={onCloseMainPanel}
            ></Button>
          </Space>
        </div>
      </div>
      <ActionCard
        changeConv={changeConv}
        changeMediaType={changeMediaType}
        changeTimeRange={changeTimeRange}
        mediaCounts={mediaCounts}
        mediaType={mediaType}
      />
    </div>
  );
}

export default PanelHeader;
