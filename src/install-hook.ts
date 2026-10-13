// 必须是 main.tsx 的第一个 import：在其他模块加载、页面发出请求之前装好钩子
import { installJsonHook } from "./hooks/use-json";

installJsonHook();
