//设置环境
const target =
  typeof window !== "undefined"
    ? window
    : typeof global !== "undefined"
    ? global
    : {};

//用于判断是否使用了开发者工具 devtool
const devtoolHook = target.__VUE_DEVTOOLS_GLOBAL_HOOK__;

export default function devtoolPlugin(store) {
  //如果没有安装，直接退出。
  if (!devtoolHook) return;

  //如果安装了，则设置到 store 上。
  store._devtoolHook = devtoolHook;

  //store 的 constructor() 函数调用时， 会调用 devtoolPlugin 函数。所以是处于vuex的init状态。
  devtoolHook.emit("vuex:init", store);

  //没弄懂是要监听啥？应该是用于调试使用。
  devtoolHook.on("vuex:travel-to-state", (targetState) => {
    //当监听事件发生之后，store会将 vuex 中响应式数据全部替换为 targetState。
    store.replaceState(targetState);
  });

  /*
    定于 store 的 mutation。会被添加到 store._subscribers[] 中。
  */
  store.subscribe(
    (mutation, state) => {
      devtoolHook.emit("vuex:mutation", mutation, state);
    },
    { prepend: true }
  );

  /**
   * 订阅 store 的 action。会被添加到 store._subscribeAction[] 中。
   */
  store.subscribeAction(
    (action, state) => {
      devtoolHook.emit("vuex:action", action, state);
    },
    { prepend: true }
  );
}
