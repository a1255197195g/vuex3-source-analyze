import { isObject } from "./util";

/**
 * vuex 中使用的四个辅助函数的来源文件 /src/helpers.js。
 * mapState,
 * mapMutations,
 * mapGetters,
 * mapActions,
 * createNamespacedHelpers
 */

/*
  mapState 经过 调用normalizeNamespace() 之后，返回的结果，这个结果就是个函数。
  我们调用的 mapState 是如下函数：

  return (namespace, map) => {
    //如果第一个参数 namespace 不是字符串。那就认为只有一个参数，该参数是个数组. 如：["user/updateName", "user/updateAge"]
    if (typeof namespace !== "string") {
      //将命名空间数组的数据统一到 map
      map = namespace;
      //设置namepace为空。
      namespace = "";

      //namespace 是 string，如果 namespace 不是以 “/” 结尾，则在尾部添加个 "/"
    } else if (namespace.charAt(namespace.length - 1) !== "/") {
      namespace += "/";
    }
    return fn(namespace, map);
  };
  第一个参数: namespace 是字符串，
  第二个参数：states 是一个数组或者非null的对象。其元素或者value可以是函数。

  ==> 当然最终就是调用了 normalizeNamespace 的第一个参数指向的函数。
  ==> 由于函数内部有 this.$store 的方式，导致必须在 vue 环境下才能使用 mapState。
*/
export const mapState = normalizeNamespace((namespace, states) => {
  //存储结果的对象，是个 {};
  const res = {};
  //如果是在开发环境，且如果不是个可用的对象，则报红提示。
  if (__DEV__ && !isValidMap(states)) {
    console.error(
      "[vuex] mapState: mapper parameter must be either an Array or an Object"
    );
  }

  //将 states 归一化为数组。格式为: [{ key:key, value:value }, ...]
  normalizeMap(states).forEach(({ key, val }) => {
    /**
     * 这里有一点需要注意：
     * computed: {
     *   ...mapState(["user1/info", "user1/name"]);
     *   ...mapState("user2", ["info", "name"]);
     *   ...mapState({
     *        "info1": "user1/info",
     *        "info2": "user2/info"
     *    })
     *   ...mapState( "user", {
     *        "info1": "info1",
     *        "info2": "info2"
     *    })
     * }
     * 1、mapState 返回的结果是一个对象，对象的中属性key，对应的value都是函数。
     *    (1) 如果是数组，则 key 就是 1，2，3，4...
     *    (2) 在 vue 的 computed 创建时，会被数据劫持，key就是不含有 namespace 的key。
     *    (3) Object.keys( res ).forEach( key=>{
     *          Object.defineProperty( vue, key, {
     *              get(){
     *                 res[key]();
     *              }
     *          })
     *      })
     *       通过数据劫持之后，就做到了 this.info1 就能调用 mappedState() 方法。
     *
     * 2、关于 ...mapState("user", [info(state, getter){}, ...]) 的形式:
     *    info( state, getter ){ ... } 通过该函数的返回值作为结果。
     */
    res[key] = function mappedState() {
      //注意这个 this 是引入 mapState 页面的 vue 实例。
      //state 存储所有的 options 中的 state 数据。
      let state = this.$store.state;
      //getters 存储所有的 options 中的 getter 数据。
      let getters = this.$store.getters;
      //如果 namespace 存在，则去对应的子 module 查找 state 和 getter。
      //否则就直接在 store 上找 state 和 getter。
      if (namespace) {
        //通过 namespace 找到指定的 module。
        const module = getModuleByNamespace(this.$store, "mapState", namespace);
        //如果不存在，则返回null。
        if (!module) {
          return;
        }
        //module.context 就是 store.js 的 local 对象。
        //module.context.state 能通过闭包的方式获取到该module 对应的 namespace，path。
        state = module.context.state;
        //module.context.state 能通过闭包的方式获取到该module 对应的 namespace，path。且会从 store.getters 中获取。
        getters = module.context.getters;
      }
      //如果val 是 mapState( [( state, getters )=>{  }] ) 的 ( state, getters )=>{  }， 则调用该函数获取返回值。
      return typeof val === "function"
        ? val.call(this, state, getters)
        : //否则直接从 state 中获取值。  这个state 是 local.state.
          state[val];
    };
    // vuex 这个属性没有见到被使用。
    // mark vuex getter for devtools
    res[key].vuex = true;
  });
  return res;
});

/*
  mapMutations
  1、当在 vue 的 methods 中使用 mapMutation([xxxx]) 时， 相当于调用了 normalizeNamespace() 函数的第一个参数对应的函数。当然参数被归一化了。
    第一个参数： namespace 是一个空字符串或者路径字符串。
    第二个参数： mutations 是一个数组或者非null的对象。
*/
export const mapMutations = normalizeNamespace((namespace, mutations) => {
  const res = {};
  //如果是开发环境，且是一个不可用的对象。（不是数组或者非null的对象）
  if (__DEV__ && !isValidMap(mutations)) {
    console.error(
      "[vuex] mapMutations: mapper parameter must be either an Array or an Object"
    );
  }
  //将第二个参数归一化。变成 [{key:key, value:value}, 。。。] 的形式。
  //  数组的key 是 1，2，3，4...
  //  数组的key 是不含有 namespace 的。
  normalizeMap(mutations).forEach(({ key, val }) => {
    /**
     *  methods: {
     *   //返回一个 res。 res形式为： { updateUserName: mappedMutation(){}, updateAge: mappedMutation(){} }
     *    ...mapMutations( "user" [ "updateUserName", "updateAge" ] );
     *  }
     *  */
    //一般 args 就是 this.$store.dispatch() 时的第二个参数 payload。
    res[key] = function mappedMutation(...args) {
      //获取 store 上的 commit 方法。
      let commit = this.$store.commit;
      //判断是否存在 namespace。如果存在，则去查找 namespace 对应的 module。
      if (namespace) {
        // module 在 store.js 中执行 installModule() 时被收集到了 store._modulesNamespaceMap 中.
        const module = getModuleByNamespace(
          this.$store,
          "mapMutations",
          namespace
        );
        //如果module不存在，则开始下一轮循环。
        if (!module) {
          return;
        }
        //存在module，则获取 local.commit.
        commit = module.context.commit;
      }

      //mapMutation([xx]) 参数数组的元素是函数，则执行该函数。
      return typeof val === "function"
        ? //函数的传入参数为：第一个参数： local.commit。 后面的参数： payload。
          //直接将该 mappedMutation 的调用转为val函数的调用，val函数的第一个参数是 local.commit.
          val.apply(this, [commit].concat(args))
        : //注意 commit 是个 local.module.
          //下面的方式只是保证这个 local.module 的 this 是 store 对象。
          //第一个参数： val, 就是 key， 即 mutation 的名称。
          //后面的参数就是 payload
          commit.apply(this.$store, [val].concat(args));
    };
  });
  return res;
});

export const mapGetters = normalizeNamespace((namespace, getters) => {
  const res = {};
  if (__DEV__ && !isValidMap(getters)) {
    console.error(
      "[vuex] mapGetters: mapper parameter must be either an Array or an Object"
    );
  }
  normalizeMap(getters).forEach(({ key, val }) => {
    //获取一个完整的命名空间 namespace + value.
    val = namespace + val;
    res[key] = function mappedGetter() {
      //如果 namespace不为空，且对应的 module 不存在，则直接下一轮循环。
      if (
        namespace &&
        !getModuleByNamespace(this.$store, "mapGetters", namespace)
      ) {
        return;
      }
      //这里 namespace 可以为 "" 的，相当于是 root module 中的 getter，或者“祖-父-自己”都没有设置 namespace=true 属性的module。
      //val 已经是 namespace + val。
      //开发环境下，且在 store.getters 中找不到对应的 getter，则报红，并直接下一轮循环。
      if (__DEV__ && !(val in this.$store.getters)) {
        console.error(`[vuex] unknown getter: ${val}`);
        return;
      }
      //返回找到的 getter。 getter 也是函数，会在 vue computed 劫持之后，调用属性就调用对应的方法。
      return this.$store.getters[val];
    };
    // mark vuex getter for devtools
    res[key].vuex = true;
  });
  return res;
});

/*
   跟 mutation 类似逻辑
*/
export const mapActions = normalizeNamespace((namespace, actions) => {
  const res = {};
  if (__DEV__ && !isValidMap(actions)) {
    console.error(
      "[vuex] mapActions: mapper parameter must be either an Array or an Object"
    );
  }
  normalizeMap(actions).forEach(({ key, val }) => {
    res[key] = function mappedAction(...args) {
      // get dispatch function from store
      let dispatch = this.$store.dispatch;
      if (namespace) {
        const module = getModuleByNamespace(
          this.$store,
          "mapActions",
          namespace
        );
        if (!module) {
          return;
        }
        dispatch = module.context.dispatch;
      }
      return typeof val === "function"
        ? val.apply(this, [dispatch].concat(args))
        : dispatch.apply(this.$store, [val].concat(args));
    };
  });
  return res;
});

/**
 * Rebinding namespace param for mapXXX function in special scoped, and return them by simple object
 * @param {String} namespace
 * @return {Object}
 */
/*
  5、createNamespacedHelpers
*/
export const createNamespacedHelpers = (namespace) => ({
  mapState: mapState.bind(null, namespace),
  mapGetters: mapGetters.bind(null, namespace),
  mapMutations: mapMutations.bind(null, namespace),
  mapActions: mapActions.bind(null, namespace),
});

/**
 * 对 map 数据进行归一化。
 */
function normalizeMap(map) {
  //如果是个不可用的对象，则返回一个空数组。
  if (!isValidMap(map)) {
    return [];
  }
  //如果 map 是一个数组或者对象， 都转换为一个数组；其中数组元素为: [{ key: key, value:value }]
  return Array.isArray(map)
    ? map.map((key) => ({ key, val: key }))
    : Object.keys(map).map((key) => ({ key, val: map[key] }));
}

/*  
  判断是不是一个数组，或者非null的对象
  isObject 的判断为：  return obj !== null && typeof obj === "object";
*/
function isValidMap(map) {
  return Array.isArray(map) || isObject(map);
}

/**
 *
 * 对命名空间 namespace 进行归一化。对参数进行统一处理。
 * 1、如果 mapstate,mapMutations,mapGetters, mapActions 传入的参数只有一个。则归一化之后参数形式为；
 *    namespace = "";
 *    map = ["user/updateName", "user/updateAge"]
 *
 * 2、如果传入的参数有两个，则第一个必然是一个字符串。
 *    namespace = "user";
 *    map = ["udpateName", "updateAge"];
 *
 * 这样 map 中的元素，与 namespace 就能组成完整的命名空间。
 */
function normalizeNamespace(fn) {
  return (namespace, map) => {
    //如果第一个参数 namespace 不是字符串。那就认为只有一个参数，该参数是个数组. 如：["user/updateName", "user/updateAge"]
    if (typeof namespace !== "string") {
      //将命名空间数组的数据统一到 map
      map = namespace;
      //设置namepace为空。
      namespace = "";

      //namespace 是 string，如果 namespace 不是以 “/” 结尾，则在尾部添加个 "/"
    } else if (namespace.charAt(namespace.length - 1) !== "/") {
      namespace += "/";
    }
    return fn(namespace, map);
  };
}

/**
 * 在 module 中通过 namespace 查询一个指定的 module。如果 module 不存在，打印错误信息
 * 1、第一个参数： store 就是 vue 页面调用的 this.$store.
 * 2、第二个参数： helper 就是表明辅助函数的名称。比如 “mapState”，仅用于错误消息提示。
 * 3、第三个参数； namespace， 就是 mapState(["/user/info"]) 的这个 “/user/info”。
 *
 * store._modulesNamespaceMap 在 store.js 中，就是用于收集所有的 module。
 *
 */
function getModuleByNamespace(store, helper, namespace) {
  //判断 store._modulesNamespaceMap 中是否收集过对应 namespace 的module。
  const module = store._modulesNamespaceMap[namespace];
  //如果是开发模式，且 module 不存在，那么就报红。
  if (__DEV__ && !module) {
    console.error(
      `[vuex] module namespace not found in ${helper}(): ${namespace}`
    );
  }
  //返回找到的 module， 当然 module 也可能为 null。
  return module;
}
