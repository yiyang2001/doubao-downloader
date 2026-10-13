import ImageCard from "./ImageCard";
import { useConvs } from "@/hooks/use-convs";
import { db } from "@/db";
import { Empty, Spin } from "@douyinfe/semi-ui-19";
import { useContext, useMemo } from "react";
import { ConvFilterContext } from "@/context/ConvFilterContext";
import { HistoryContext } from "@/context/HistoryContext";
import { ConvContext } from "@/context/ConvContext";
import { matchesConvScope } from "@/utils/conv-filter";

const READY_MEDIA_COUNT = 10;
import { useLiveQuery } from "dexie-react-hooks";

interface ImageListProps {
  className?: string;
}

function ImageList({ className }: ImageListProps) {
  const convs = useConvs();
  const downloadedArray = useLiveQuery(() => db.downloaded.toArray(), []);
  const downloadedUrls = useMemo(
    () => new Set(downloadedArray?.map((item) => item.url) ?? []),
    [downloadedArray],
  );

  const { showConvId } = useContext(ConvFilterContext);
  const { currentConvId, isLoadingHistory } = useContext(HistoryContext);
  const { convMessage } = useContext(ConvContext);
  // 加载当前会话的历史时，先攒够最新的一批再展示，更早的在后台继续加载
  const isPreparing =
    isLoadingHistory &&
    showConvId === currentConvId &&
    convMessage.filter((item) => item.creation && matchesConvScope(item, showConvId)).length <
      READY_MEDIA_COUNT;

  const BodyContent = useMemo(() => {
    if (isPreparing) {
      return (
        <div className="dd:flex dd:justify-center dd:items-center dd:h-full">
          <div className="dd:flex dd:items-center dd:gap-3 dd:whitespace-nowrap">
            <Spin size="large" />
            <span>正在加载…</span>
          </div>
        </div>
      );
    }
    if (convs.length > 0) {
      return (
        <div
          className={`${className} dd:grid dd:grid-cols-2 dd:sm:grid-cols-3 dd:lg:grid-cols-4 dd:gap-2`}
        >
          {convs.map((conv) => (
            <ImageCard
              className="dd:mt-2!"
              // 不能用序号：切换会话后同一位置的卡片会被复用，新图加载完之前仍显示上一个会话的图
              key={`${conv.source}_${conv.message_id}_${conv.creation.image.key}`}
              conv={conv}
              downloadedUrls={downloadedUrls}
            />
          ))}
        </div>
      );
    }
    return (
      <div className="dd:flex dd:justify-center dd:items-center dd:h-full">
        <Empty description="暂无数据" />
      </div>
    );
  }, [convs, downloadedUrls, isPreparing, className]);

  return (
    <div id="dd-modal-popup-container" className="dd:w-full dd:h-full">
      {BodyContent}
    </div>
  );
}

export default ImageList;
