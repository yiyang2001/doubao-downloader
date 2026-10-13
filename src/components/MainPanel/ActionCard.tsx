import { ConvContext } from "@/context/ConvContext";
import { Button, Card, DatePicker, Radio, RadioGroup, Select, Space, Spin } from "@douyinfe/semi-ui-19";
import { memo, useContext, useMemo } from "react";
import type { MediaCounts } from "@/utils/media-filter";
import type { MediaType } from "@/types";
import { AISPACE_FILTER, buildConvOptions, matchesConvSearch } from "@/utils/conv-filter";
import { ConvFilterContext } from "@/context/ConvFilterContext";
import { HistoryContext } from "@/context/HistoryContext";

interface ActionCardProps {
  changeConv: (convId: string) => void;
  changeTimeRange: (startTime?: number, endTime?: number) => void;
  changeMediaType: (mediaType: MediaType) => void;
  mediaCounts: MediaCounts;
  mediaType: MediaType;
}

function ActionCard({
  changeConv,
  changeTimeRange,
  changeMediaType,
  mediaCounts,
  mediaType,
}: ActionCardProps) {
  const { convMessage, handleDownloadAll, handleDownloadSelected } =
    useContext(ConvContext);
  const convOptions = useMemo(() => buildConvOptions(convMessage), [convMessage]);
  const { showConvId } = useContext(ConvFilterContext);
  const { currentConvId, isLoadingHistory, toggleLoadHistory } = useContext(HistoryContext);
  // 当前会话即使还没捕获到媒体也要列出来，否则选中它时下拉框没有对应的选项
  const pinnedConv = currentConvId ? { id: currentConvId, label: currentConvId } : undefined;
  const otherConvs = convOptions.filter((item) => item.id !== currentConvId);

  return (
    <Card>
      <div className="dd:w-full dd:flex dd:flex-wrap dd:items-center dd:gap-2 dd:cursor-default">
        <Select
          value={showConvId}
          style={{ width: 200 }}
          onChange={(value) => changeConv(value as string)}
          filter={(input, option) =>
            matchesConvSearch(input, String(option.value), pinnedConv?.id)
          }
          searchPosition="dropdown"
          searchPlaceholder="搜索对话ID"
        >
          {pinnedConv && (
            <Select.Option
              className="dd:justify-start! dd:sticky dd:top-0 dd:z-1 dd:bg-(--semi-color-bg-3)!"
              key={pinnedConv.id}
              value={pinnedConv.id}
            >
              当前对话 {pinnedConv.label}
            </Select.Option>
          )}
          <Select.Option className="dd:justify-start!" key="-1" value="-1">
            所有对话
          </Select.Option>
          <Select.Option className="dd:justify-start!" key={AISPACE_FILTER} value={AISPACE_FILTER}>
            我的创作
          </Select.Option>
          {otherConvs.map((item) => (
            <Select.Option
              className="dd:justify-start!"
              key={item.id}
              value={item.id}
            >
              {item.label}
            </Select.Option>
          ))}
        </Select>
        <DatePicker
          type="dateRange"
          placeholder={["开始日期", "结束日期"]}
          onChange={(date) => {
            if (date && Array.isArray(date) && date.length === 2) {
              const [start, end] = date as [Date, Date];
              changeTimeRange(start.getTime(), end.getTime() + 86400000 - 1);
            } else {
              changeTimeRange(undefined, undefined);
            }
          }}
          style={{ width: 240 }}
        />
        <RadioGroup
          aria-label="媒体类型"
          type="button"
          value={mediaType}
          onChange={(event) => changeMediaType(event.target.value as MediaType)}
        >
          <Radio value="all">全部 {mediaCounts.all}</Radio>
          <Radio value="image">图片 {mediaCounts.image}</Radio>
          <Radio value="video">视频 {mediaCounts.video}</Radio>
        </RadioGroup>
        <Space>
          <Button
            icon={isLoadingHistory ? <Spin size="small" /> : undefined}
            onClick={toggleLoadHistory}
            type="tertiary"
          >
            {isLoadingHistory ? "停止加载" : "加载更早的消息"}
          </Button>
          <Button onClick={handleDownloadSelected} type="tertiary">下载选中</Button>
          <Button onClick={handleDownloadAll} type="tertiary">全部下载</Button>
        </Space>
      </div>
    </Card>
  );
}

export default memo(ActionCard);
