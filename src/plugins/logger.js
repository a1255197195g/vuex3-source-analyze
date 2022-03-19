// Credits: borrowed code from fcomb/redux-logger

import { deepCopy } from "../util";

/**
 * 关于 createLogger 的使用： ===> 以插件的方式进行使用。用于打印 vuex 使用过程中的消息日志。
 * import { createLogger } from 'vuex';
   const store = new Vuex.store({
        state: {},
        mutations: {},
        actions: {},
        plugins: process.env.NODE_DEV !== 'production' ? [createLogger()]:[],
        strict: true
    });
    export default store;
 * 
 */
export default function createLogger({
  //用于判断使用 console.group ，还是使用 console.grounpCollased 来进行分组打印消息。
  collapsed = true,
  //用于设置 commit 的过滤条件，该函数返回false，则表示不打一个当前commit行为的日志消息。
  filter = (mutation, stateBefore, stateAfter) => true,
  //将 state 数据转换成自定义的格式。
  transformer = (state) => state,
  //将 mutation 数据 { type, payload } 转化为自定义的格式。
  mutationTransformer = (mut) => mut,
  //用于设置 dispatch 的过滤条件，该函数返回false，则表示不打一个当前dispatch行为的日志消息。
  actionFilter = (action, state) => true,
  //将 action 数据 { type, payload } 转化为自定义的格式。
  actionTransformer = (act) => act,
  //是否要开启打印所有 commit 行为的日志消息。
  logMutations = true,
  //是否要开启打印所有 dispatch 行为的日志消息。
  logActions = true,
  //指定打印日志的对象。默认为 console
  logger = console,
} = {}) {
  //在 store.js 的 constructor() 方法中调用 plugins.forEach((plugin) => plugin(this)); 传入的参数 this 就是 store。
  //也就是说，下面的这个函数，是在 store 初始化时就被调用了的。
  return (store) => {
    //深度拷贝一份 store.state 对象， 这个state是 store._vm 实例 data 中的state属性数据。
    let prevState = deepCopy(store.state);

    //如果没有指定打印输出对象，直接返回。默认是 console.
    if (typeof logger === "undefined") {
      return;
    }

    //如果指定了 logMutations ，则订阅 mutation 消息队列。
    if (logMutations) {
      //当 commit(_type, _payload, _options)  函数被调用时，该订阅回调函数会被调用。
      store.subscribe((mutation, state) => {
        //第一个参数： mutation 是 const mutation = { type, payload }; type是 namspace;
        //第二个参数： state 就是 store.state
        const nextState = deepCopy(state);

        //用于判断是否要打印这个 mutation 的日志。默认是所有commit都会触发打印日志。
        if (filter(mutation, prevState, nextState)) {
          //获取当前的时间的”时分秒毫秒“。
          const formattedTime = getFormattedTime();
          //对mutation进行格式转化，默认是不处理。
          const formattedMutation = mutationTransformer(mutation);
          //mutation.type 就是 commit() 方法调用时候的第一个参数；
          const message = `mutation ${mutation.type}${formattedTime}`;

          //开启分组，以 message 作为消息日志的分组的名称。
          startMessage(logger, message, collapsed);
          logger.log(
            "%c prev state",
            "color: #9E9E9E; font-weight: bold",
            //转换 state 数据格式。默认是不转换。 prevState 展示改变数据之前的 state。
            transformer(prevState)
          );
          logger.log(
            "%c mutation",
            "color: #03A9F4; font-weight: bold",
            //格式转换之后的  { type, payload } 数据，即 commit 的第一个参数，第二个参数。这两个参数是被store.unifyObjectStyle()统一处理过的。
            formattedMutation
          );
          logger.log(
            "%c next state",
            "color: #4CAF50; font-weight: bold",
            //转换 state 数据格式。默认是不转换。 nextState 展示改变数据之后的 state。
            transformer(nextState)
          );
          //结束分组。
          endMessage(logger);
        }

        //nextState 成为下一次 commit 时的旧 state。
        prevState = nextState;
      });
    }

    //如果开启了打印 action 日志的属性。
    if (logActions) {
      //当 dispatch(_type, _payload)  函数被调用时，该订阅回调函数会被调用。
      store.subscribeAction((action, state) => {
        //判断是不是要过滤掉当前 dispatch 事件的日志，默认是打印所有的 dispatch 行为日志。
        if (actionFilter(action, state)) {
          //获取当前的时间的”时分秒毫秒“。
          const formattedTime = getFormattedTime();
          //获取转换格式的 action 对象； action 是这个数据 const action = { type, payload };这两个参数是被store.unifyObjectStyle()统一处理过的。
          const formattedAction = actionTransformer(action);
          //日志分组的名称
          const message = `action ${action.type}${formattedTime}`;

          //开启console日志分组。
          startMessage(logger, message, collapsed);
          //开始打印日志。
          logger.log(
            "%c action",
            "color: #03A9F4; font-weight: bold",
            //formattedAction 仅仅是个数据对象。{ type, payload }
            formattedAction
          );
          //结束console日志分组。
          endMessage(logger);
        }
      });
    }
  };
}

/*
  console.group(); 开启一个分组
  ==> 这之间 console 打印的内容，会被收集到一个分组，且展开和收起。
  console.groupEnd(); 结束一个分组

  console.groupCollapsed() 方法用于设置折叠的分组信息，在这个代码以下执行输出的信息都会再折叠的分组里。点击扩展按钮打开分组信息。
    第一个参数是 console；
    第二个参数是 message 表示分组的名称。
  */
function startMessage(logger, message, collapsed) {
  const startMessage = collapsed ? logger.groupCollapsed : logger.group;

  try {
    //使用上面的 console.group 或者 console.groupCollapsed 来打印。
    startMessage.call(logger, message);
  } catch (e) {
    //如果上面的方法不存在，则使用 console.log 来打印。
    logger.log(message);
  }
}

/*
  对于使用了 console.group(), console.groupCollapsed() 方法打印日志，则需要使用 console.groupEnd() 来结束。
*/
function endMessage(logger) {
  try {
    logger.groupEnd();
  } catch (e) {
    logger.log("—— log end ——");
  }
}

/**
 * 获取当前日期的格式化时间  "HH:mm:ss.msecond"
 */
function getFormattedTime() {
  //获取当前日期。
  const time = new Date();
  //保证小时，分钟，秒都是2位数, 毫秒是3位数。
  return ` @ ${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(
    time.getSeconds(),
    2
  )}.${pad(time.getMilliseconds(), 3)}`;
}

/*
  将 str 重复 times 次。比如 str="hello", times=2 ===> 返回结果为 "hellohello"
*/
function repeat(str, times) {
  return new Array(times + 1).join(str);
}

/*
  左填充0，当 num 的长度不够 maxLength 时，填充0.
*/
function pad(num, maxLength) {
  return repeat("0", maxLength - num.toString().length) + num;
}
