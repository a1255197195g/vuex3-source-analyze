import applyMixin from "./mixin";
import devtoolPlugin from "./plugins/devtool";
import ModuleCollection from "./module/module-collection";
import { forEachValue, isObject, isPromise, assert, partial } from "./util";

let Vue; // bind on install

/***
 * Vuex 使用的第二步，即 new Vuex.Store( options ) 的数据初始化过程。
 * 1、使用 _modulesNamespaceMap 来收集所有创建的 module 实例。
 * 2、使用 rootState（store._modules.root.state）来收集所有 module 实例的 state 数据。
 *
 *  _committing: 用于判断是不是通过commit方式执行。如果mutation是异步方式执行，则 _committing 已经为 false 了。
 * 
 *
 * 关于 local 对象：
 * ===> local 表示查找“对应module”的dispatch,commit,getter,state;
 * ===> store 表示查找”root module“的dispatch,commit,getter,state;
 * 1、local 对象相当于 对应module实例的context对象，用于查找对应module的 dispatch，commit，getters，state。
 * 2、用户自定义的 action 方法第一个参数携带的参数为：
 *    {
        dispatch: local.dispatch,
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state,
      },
 * 3、用户自定义的 mutation 方法第一个参数携带的参数为：
 * 4、用户自定义的 getter 方法有四个参数，分别是：
 *    (  
 *      local.state, // local state
        local.getters, // local getters
        store.state, // root state
        store.getters // root getters 
      )
 */
export class Store {
  /**
   * 关于 Object.create(null)
   * ===> Object.create(null)没有继承任何原型方法，也就是说它的原型链没有上一层。
   * ===> 相关分析文章： https://juejin.cn/post/6844903589815517192
   */

  constructor(options = {}) {
    // 条件1: !Vue  ==> 如果创建 Vuex.Store() 对象时，没有经过 Vue.use(Vuex)将 Vue 实例保存。
    // 条件2: typeof window !== 'undefined' 表示是浏览器环境。
    // 条件3: window.Vue 表示 window 上有挂在 vue 实例。
    if (!Vue && typeof window !== "undefined" && window.Vue) {
      //那么就使用 window.Vue 来走 vuex.install 的挂载流程。
      install(window.Vue);
    }

    /**
     * __DEV__ 不是一个真实存在的变量。它在JS代码编译阶段，会被一个常量来替换，通常在 development 下是 true，在 production 模式下是 false
     */
    if (__DEV__) {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`);
      assert(
        typeof Promise !== "undefined",
        `vuex requires a Promise polyfill in this browser.`
      );
      assert(
        this instanceof Store,
        `store must be called with the new operator.`
      );
    }

    /**
     * 从 options 中获取 plugins 插件数组， strict 严格模式属性。
     */
    const { plugins = [], strict = false } = options;

    //用来标记是否通过 commit(xxxx, payload) 方式来出发的 state 状态的更新。
    //this._committing 是 store 中的一个内部变量。
    this._committing = false;

    //创建一个 _actions 对象。
    this._actions = Object.create(null);
    this._actionSubscribers = [];

    //创建一个 _mutations 对象。
    this._mutations = Object.create(null);
    //创建一个 _wrappedGetters 对象。

    this._wrappedGetters = Object.create(null);
    //创建 modules 对象。
    /***
     * 1、此时已经将options数据转换成了 module 实例结果。
     *    moduleCollection 结构为： {
     *        root: rootModule
     *    }
     *    module实例结构为: {
     *        runtime: runtime,
     *        state: rawModule.state
     *        _children: {
     *          user: {
     *            runtime: runtime,
     *            state:   对应rawModule.state,
     *            __children: {
     *              xxxxxx
     *            }
     *          },
     *          info: {
     *            runtime: runtime,
     *            state:   对应rawModule.state,
     *            __children: {
     *              xxxxxx
     *            }
     *          }
     *        }
     *    }
     * __modules 指向 moduleCollection 实例。
     */
    this._modules = new ModuleCollection(options);
    //常见命名空间（namespace）map。这个是用来存储已经创建的 module 实例的。
    this._modulesNamespaceMap = Object.create(null);

    //创建订阅者队列。
    this._subscribers = [];
    //vue 实例。但是没有设置数据源，借用vue的监听
    this._watcherVM = new Vue();
    /**
     * _wrappedGetters
     * _makeLocalGettersCache
     */
    //创建一个 Getters 的缓存
    this._makeLocalGettersCache = Object.create(null);

    //在下面的函数中，函数作用域中的 this 并不指向 store， 所以用了个 store 对象指向本身。 类似于 let that = this;
    const store = this;
    //获取 Store 类中的 dispath, commit 方法。
    const { dispatch, commit } = this;
    //对 store 本身的 dispatch 方法进行装饰增强。主要用于保证 dispatch 内的 this，永远是指向 store。
    this.dispatch = function boundDispatch(type, payload) {
      return dispatch.call(store, type, payload);
    };
    //对 store 本身的 commit 方法进行装饰增强。主要用于保证 commit 内的 this，永远是指向 store。
    this.commit = function boundCommit(type, payload, options) {
      return commit.call(store, type, payload, options);
    };

    //获取严格模式，默认是 false。
    // 可以在 new Vuex.Store( { strict: true } ) 方式来设置
    this.strict = strict;

    //获取根 modules 上的 state 对象。
    const state = this._modules.root.state;

    /**
     * 递归的形式，将 root module，以及所有的 children module 进行初始化和注册。
     * 1、初始化 root module。
     * 2、递归注册所有的 children modules。
     * 3、收集所有 modules 的 getters 放到 this._wrappedGetters 中。
     */
    installModule(this, state, [], this._modules.root);

    /**
     * 初始化 store vm 响应式对象。同时注册 __wrappedGetters 为 vm 的计算属性。
     */
    resetStoreVM(this, state);

    //应用 Vuex.Store( { plugins: [ xxxx, xxx ] } ) 中注册的插件。
    plugins.forEach((plugin) => plugin(this));

    //判断是否使用 devtool.
    //除了 devtools 插件会被 vuex 内置判断进行使用。其余的插件都需要在 new Vuex.Store(options) 中 { plugins: [xxx] } 形式配置。
    const useDevtools =
      options.devtools !== undefined ? options.devtools : Vue.config.devtools;
    if (useDevtools) {
      devtoolPlugin(this);
    }
  }

  /**
   * store.state的取值
   */
  get state() {
    // resetStoreVM() 方法时，会创建 vue 实例，且会把 state 作为 vue中data的属性；
    //   会把 getters 转换为 computed。
    return this._vm._data.$$state;
  }

  /**
   * 能通过 $store.state 获取属性，但是不能对 $store.state 设置值。
   */
  set state(v) {
    if (__DEV__) {
      assert(
        false,
        `use store.replaceState() to explicit replace store state.`
      );
    }
  }

  /**
   * 被外部调用的 commit 方法。 this.$store.commit( "/user/info/setName", { ... }, options );
   *    第一个参数： store的 namespace 对应的值，用来在 store._mutation 中取 wrappedMutationHandler 方法。
   *    第二个参数： payload 表示携带的数据。
   *    第三个参数： options 已经不再使用。
   *
   * 其中 _type 可以是字符串，也可以是对象。
   *    如果是字符串，则形式为： "/user/infi/setName";
   *    如果是不为null的对象，则去 _type.type 作为 commit 的第一个参数， _type 自身作为第二个参数, payload 作为第三个参数。
   *
   * 1、mutation 对应的订阅队列为： _subscribers。
   * 2、同一个 key， 可以存在多个 mutation 方法。
   */
  commit(_type, _payload, _options) {
    //检查_type的数据类型，如果是字符串，则什么都不处理。
    //   如果是对象，且存在 type.type，则将 type.type 作为type。type转为 payload， payload转为 options。
    const { type, payload, options } = unifyObjectStyle(
      _type,
      _payload,
      _options
    );

    //type就是命名空间名称， payload 携带的数据。
    const mutation = { type, payload };
    //store中通过 installModule 存储的 mutation。 entry 是一个数组，允许相同key，存储多个 mutation 方法。
    const entry = this._mutations[type];
    //当 options 中不存在一个 mutaions 时，则 entry 不会被初始化为 [].
    if (!entry) {
      //如果开发环境下，则报红。
      if (__DEV__) {
        console.error(`[vuex] unknown mutation type: ${type}`);
      }
      return;
    }

    //this._withCommit 主要是提供一个 committing 的环境。用于判断 state 中的属性值，是否是通过 this.$store.commit() 的方式进行更改。
    this._withCommit(() => {
      //遍历执行当前 type 对应的所有 commit 方法。
      entry.forEach(function commitIterator(handler) {
        //定义执行 用户定义的 commit 的包装方法 function wrappedMutationHandler(payload) {}
        //   而在 wrappedMutationHandler 会强制让 this 绑定为 store, 且多传入一个当前 module对一个的 state 对象。
        handler(payload);
      });
    });

    //store中的发布订阅模式下的 订阅函数，会被调用。
    //   第一个参数：mutation 是 { type, payload } 数据对象。
    //   第二个参数是 this._vm.$$data.state。
    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach((sub) => sub(mutation, this.state));

    //明显在 commit 中传递 options 参数，没有被使用了。
    if (__DEV__ && options && options.silent) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
          "Use the filter functionality in the vue-devtools"
      );
    }
  }

  /**
   * 被外部调用的 dispatch 方法。 this.$store.dispatch( "/user/info/setName", { ... }, options );
   *  第一个参数 _type 也如同 commit 一样，既可以是对象，也可以是字符串。
   *  第二个参数 _payload 表示是携带的参数。
   *
   *
   * 其中 _type 可以是字符串，也可以是对象。
   *    如果是字符串，则形式为： "/user/infi/setName";
   *    如果是不为null的对象，则去 _type.type 作为 commit 的第一个参数， _type 自身作为第二个参数, payload 作为第三个参数。
   *
   *
   * 1、dispatch 对应的订阅队列为 _actionSubscribers。
   * 2、同一个 key， 可以存在多个 action 方法。
   */
  dispatch(_type, _payload) {
    //如果 type 是字符串，则 type = _type; payload = _payload;
    //如果 type 是不为null的对象，则 type=_type.type; payload=_type;
    const { type, payload } = unifyObjectStyle(_type, _payload);

    const action = { type, payload };
    const entry = this._actions[type];
    //如果不存在一个 action 方法，则开发模式下直接报红
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown action type: ${type}`);
      }
      return;
    }
    w;
    //判断 action 的订阅对象。
    //  如果订阅对象存在 before 方法, 那么就调用该订阅对象的 before 方法。
    try {
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter((sub) => sub.before)
        .forEach((sub) => sub.before(action, this.state));
    } catch (e) {
      if (__DEV__) {
        console.warn(`[vuex] error in before action subscribers: `);
        console.error(e);
      }
    }

    //因为 action 都是 promise 方法。所以使用 Promise.all 来保证所有的异步都执行完成，才返回结果。
    //Promise.all 返回的结果是一个 promise 对象。 且 promise.then( res=>{...} )，这个 res是一个数组。
    const result =
      entry.length > 1
        ? Promise.all(entry.map((handler) => handler(payload)))
        : //如果当前key只有一个 mutation，则执行执行。
          entry[0](payload);

    return new Promise((resolve, reject) => {
      //result 是一个 promise，通过 then 用于获取数据结果。
      result.then(
        (res) => {
          //如果对 action 进行了订阅的对象，存在 after 方法，则调用 after 方法。
          try {
            this._actionSubscribers
              .filter((sub) => sub.after)
              .forEach((sub) => sub.after(action, this.state));
          } catch (e) {
            if (__DEV__) {
              console.warn(`[vuex] error in after action subscribers: `);
              console.error(e);
            }
          }
          resolve(res);
        },
        (error) => {
          //如果对 action 进行了订阅的对象，存在 error 方法，在在result产生异常的时候调用 error 方法。
          try {
            this._actionSubscribers
              .filter((sub) => sub.error)
              .forEach((sub) => sub.error(action, this.state, error));
          } catch (e) {
            if (__DEV__) {
              console.warn(`[vuex] error in error action subscribers: `);
              console.error(e);
            }
          }
          reject(error);
        }
      );
    });
  }

  /**
   * 外部订阅 store.commit 事件。 fn 为回调函数。
   */
  subscribe(fn, options) {
    return genericSubscribe(fn, this._subscribers, options);
  }

  /*
    外部用于 store.dispatch 事件， fn为回调事件。
  */
  subscribeAction(fn, options) {
    const subs = typeof fn === "function" ? { before: fn } : fn;
    //返回结果是一个函数，这个函数用于从订阅队列中卸载该订阅函数。
    return genericSubscribe(subs, this._actionSubscribers, options);
  }

  /*
    外部用于监听指定 getter 的调用； 基本用不到。
  */
  watch(getter, cb, options) {
    if (__DEV__) {
      //判断getter是不是函数。
      assert(
        typeof getter === "function",
        `store.watch only accepts a function.`
      );
    }
    //当 getter 方法被调用时，则会调用 cb 回调函数。
    return this._watcherVM.$watch(
      () => getter(this.state, this.getters),
      cb,
      options
    );
  }

  /**
    替换掉整个响应式的 state； 基本用不到。
 */
  replaceState(state) {
    //在comit环境下替换。即 store._committing 为true 的上下文环境。
    this._withCommit(() => {
      this._vm._data.$$state = state;
    });
  }

  /**
   * 注册 Module
   */
  registerModule(path, rawModule, options = {}) {
    //如果path是字符串，则转换成只有一个元素的数组。
    if (typeof path === "string") path = [path];

    //如果是开发环境，判断path必须是一个数组。判断path数组不能为空。
    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
      assert(
        path.length > 0,
        "cannot register the root module by using registerModule."
      );
    }

    //将 rawModule 数据转化为一个 module 实例。path不能为空，表明不能注册到 store._modules.root 上。
    // 根据 path 数组存储的字符串元素，组成一个路径，找到 parent module。然后将当前 module 添加到父module._children 中。
    // 如果当前 module 存在子 module，则递归增加子 module。
    this._modules.register(path, rawModule);
    //将module的
    installModule(
      this,
      this.state,
      //用于查找 state 的路径数组。
      path,
      //找到对应的 module 实例。
      this._modules.get(path),
      options.preserveState
    );

    //当 getter，state 发生变化，就重新构建 store._vm 对象。
    resetStoreVM(this, this.state);
  }

  /*
   * 卸载 Module
   */
  unregisterModule(path) {
    //如果path是字符串，则转换为单个元素的数组。
    if (typeof path === "string") path = [path];

    //开发环境下，path不是数组，则报错。
    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    //找到 module，然后从 parent module 中移除。
    this._modules.unregister(path);
    //从 this.state 中找到父 module 对应的部分。
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1));
      //从 parentState 中删除当前 module 对应的 state。
      Vue.delete(parentState, path[path.length - 1]);
    });
    //state 数据发生改变，重置 store。
    resetStore(this);
  }

  /*
   * 判断是否有对应路径的 Module
   */
  hasModule(path) {
    //如果path是字符串，则转换为单个元素的数组。
    if (typeof path === "string") path = [path];

    //开发环境下，path不是数组，则报错。
    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    //根据 path， 找到 parent module。 然后找到当前 module。如果存在，则返回true，否则false。
    return this._modules.isRegistered(path);
  }

  //热重载： newOptions数据就是一个 rawRootModule；
  hotUpdate(newOptions) {
    this._modules.update(newOptions);
    //使用 newOption 作为 Vuex.Store( options ) 的options参数，
    //重新构建 moduleCollection, store 中的数据。
    resetStore(this, true);
  }

  /*
    利用 js 单线程环境，为某一代码片段之行提供一个环境变量。
      1、当开始 commit 时，则设置 store._committing 为 true。
      2、然后执行 commit() 方法。
      3、执行完成之后，将 store._committing 设置为 false。
  */
  _withCommit(fn) {
    const committing = this._committing;
    this._committing = true;
    fn();
    this._committing = committing;
  }
}

/*
  fn：    回调函数。
  subs ： 订阅队列。
*/
function genericSubscribe(fn, subs, options) {
  //如果该函数不存在与 subs 中。
  if (subs.indexOf(fn) < 0) {
    //如果设置了 prepend 属性，则添加到订阅队列的第一个位置。否则追加到末尾。
    options && options.prepend ? subs.unshift(fn) : subs.push(fn);
  }

  //返回一个函数，这个函数用于卸载当前的订阅函数。
  return () => {
    const i = subs.indexOf(fn);
    if (i > -1) {
      subs.splice(i, 1);
    }
  };
}

/*
  重置 store 对象。
*/
function resetStore(store, hot) {
  //初始化 _actions  ： 用于存储 action
  store._actions = Object.create(null);
  //初始化 _mutations  : 用于存储 mutation
  store._mutations = Object.create(null);
  //初始化 _wrappedGetters  ：用于存储 getter
  store._wrappedGetters = Object.create(null);
  //初始化 _modulesNamespaceMap  ： 用于存储module实例的。
  store._modulesNamespaceMap = Object.create(null);

  //获取 store._vm.data.$$state
  const state = store.state;
  //store 重新开始收集 state,mutation,actions,getters.
  installModule(store, state, [], store._modules.root, true);
  //重置 store._vm
  resetStoreVM(store, state, hot);
}

function resetStoreVM(store, state, hot) {
  //旧的 vm 实例。 oldVm 也可能为 undefined
  const oldVm = store._vm;
  //初始化 store.getters 对象。
  store.getters = {};
  //初始化本地的 getters 缓存。
  store._makeLocalGettersCache = Object.create(null);
  //_wrappedGetters 存储有所有用户自定义 getter 的容器。
  const wrappedGetters = store._wrappedGetters;
  //
  const computed = {};

  //fn: 是 wrappedGetters 的 value。
  forEachValue(wrappedGetters, (fn, key) => {
    // 使用 comuted 来利用它的延迟加载机制
    // 直接使用内联函数将会导致闭包保留旧的 vm。
    // 使用 partial 返回只保留在闭包环境中的参数的函数。
    computed[key] = partial(fn, store);
    //在 store.getters 中定义与 wrappedGetters 相同的属性key(key 是一个完整的namespace)。
    Object.defineProperty(store.getters, key, {
      //get方法从 vm 中获取值。
      get: () => store._vm[key],
      //可以被遍历。
      enumerable: true, // for local getters
    });
  });

  //Vue.config.silent = true 的作用是用来取消 vue 所有的日志与警告。
  //保留 vue 项目本身的 Vue.config.silent 配置，当 store._vm 创建完毕之后就会还原。
  const silent = Vue.config.silent;

  /**
   * 1、Vue.config.silent = true 的作用是用来取消 vue 所有的日志与警告。
   * 2、仅仅在 使用 { data: {}, computed: {}  } 创建 vue 实例的过程中消除日志和警告。
   */
  Vue.config.silent = true;
  //创建vue实例，且 options 中含有 data，与compted。
  //  其中 state，仅仅是 root module 实例的 state 数据。
  store._vm = new Vue({
    data: {
      $$state: state,
    },
    computed,
  });

  Vue.config.silent = silent;

  /*
     如果开启了严格模式，那么会进行不是 调用mutation 修改 state 数据的检查。
  */
  if (store.strict) {
    enableStrictMode(store);
  }

  //如果旧的 vm 存在。
  if (oldVm) {
    //如果热重载参数 hot 为 true。
    if (hot) {
      //调度更改所有订阅的观察者，以强制getter重新评估热重装。
      store._withCommit(() => {
        oldVm._data.$$state = null;
      });
    }
    //则销毁 vm 对象。
    Vue.nextTick(() => oldVm.$destroy());
  }
}

/**
 *  installModule() 函数：
 *    第一个参数：store: Vuex.Store() 实例。
 *    第二个参数：rootState: options 中最外层的 state 属性。递归之后，rootState 会包含所有子 Module 的 state。
 *    第三个参数：path:  默认是空数组。递归之后就是保存当前module的key数组。 ["user", "info", "name"]
 *    第四个参数：module： 默认是 this.modules.root; 表示当前的 module。
 */
function installModule(store, rootState, path, module, hot) {
  //如果数组是空，则此时为 root module。如果不为空，则path数组为 祖先-父亲-自己的key组成的数组。
  const isRoot = !path.length;

  //组成一个完整的命名空间名称，如果当前module的options没有配置 { namespace: false },则该module的key不计入 namespace 中。
  //获取命名空间, 比如 path为 ["namespace1", "namespace2", "namespace3"] ==> "/namespace1/namespace2/namespace3"
  const namespace = store._modules.getNamespace(path);

  /**
   * 下面的代码主要是使用 store._modulesNamespaceMap 以完整的 namespace 作为 key， 来收集所有创建的 module 实例。
   */
  // module.namespace 就是 options数据对应的子 rawModule 的属性 namespace,值为 true 或者 false。
  //   如果 module.namespace 值为 true，则表示开启了命名空间。(子 rawModule建议配置 namespace=true)
  if (module.namespaced) {
    //如果当前的 namespace 已经被 _modulesNamespaceMap 收集过，且是开发环境，则报错提示，但是依然采用后面注册的 namespace 的 module， 覆盖之前注册的 module。
    if (store._modulesNamespaceMap[namespace] && __DEV__) {
      console.error(
        `[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join(
          "/"
        )}`
      );
    }
    //使用 _modulesNamespaceMap 来收集所有创建的 module 实例。这个 namespace 的值为 "/namespace1/namespace2/namespace3";
    //将 module 在 命名空间map 中注册。同一个namespace时，新的覆盖旧的。
    store._modulesNamespaceMap[namespace] = module;
  }
  /***********************************************************************/

  /*
    下面的代码主要是用来将所有 module 的 state 数据收集，并且组成树形结构。
    parentState : {
       //当前module 的 state
       moduleName:  curState: {
          age: xxx,
          name: xxx,
          childModuleName: childState: {
            xxxx
          }
       },
       //父 module 的 state。
       user: {
         xxxx
       }
    }
  */
  //如果当前 module 不是 root module 实例。
  // hot 暂时不知道什么意思。
  if (!isRoot && !hot) {
    //根据 path 数组的 key，找到父 module 实例的 state。
    const parentState = getNestedState(rootState, path.slice(0, -1));
    //获取当前 module 的 key。
    const moduleName = path[path.length - 1];

    //在 commit 环境去更改 state 属性.
    //1、 执行 Vue.set(parentState, moduleName, module.state); 之前 设置 committing = true;
    //2、 执行 Vue.set(parentState, moduleName, module.state);
    //3、 执行 Vue.set(parentState, moduleName, module.state); 之后 设置 committing = false;
    store._withCommit(() => {
      if (__DEV__) {
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join(
              "."
            )}"`
          );
        }
      }
      /*
       * 将当前module的state数据，响应式的加入到父state。key为模块名。
       * parentState: {
       *   "user": curState
       * }
       */
      Vue.set(parentState, moduleName, module.state);
    });
  }
  /***********************************************************************/

  /*
     module.context： 设置当前 module 的上下文环境。
      ==> 根据 namespace 查找到对应在 store._getters, store._state 中存储的对应方法。
      ==>        以及对应 namespace 的 type, 正确调用 store.dispatch, store.commit。 
     {
        dispatch: ( _type, _payliad, _options ){ ... }
        commit: (_type, _payload, _options){ ... },
        getters: 
     }
  */
  const local = (module.context = makeLocalContext(store, namespace, path));

  /**
   * 当前 Module 实例的 rawModule 数据中的 mutations 对象进行遍历。
   * const namespacedType = namespace + key; 形式为： “/user/info/updateAge”, 其中 updateAge 为 mutation 名。
   */
  module.forEachMutation((mutation, key) => {
    //namespacedType格式为： “/user/info/updateInfo”
    const namespacedType = namespace + key;
    registerMutation(store, namespacedType, mutation, local);
  });

  /*
    当前 Module 实例的 rawModule 数据中的 actions 对象进行遍历。
    {
      actons: {
        updateUserInfo(){
          root: true,
          handler: function(){
            xxxxx
          }
        },
        udpateUserName(){
          xxxxx
        }
      }
    }
  */
  module.forEachAction((action, key) => {
    //如果设置了 action.root 为 true，则直接使用 key 作为 $store._actions 的存储key。
    const type = action.root ? key : namespace + key;
    //如果 action 是一个对象，则从 action.handler 中获取 action 方法。
    //    否则action本身就是一个 function。
    const handler = action.handler || action;
    registerAction(store, type, handler, local);
  });

  /* 
     当前 Module 实例的 rawModule 数据中的 getters 对象进行遍历。
  */
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key;
    registerGetter(store, namespacedType, getter, local);
  });

  //递归遍历所有的子module。
  module.forEachChild((child, key) => {
    //所有的 installModule 第一个参数始终是 store 对象；第二个参数是 this._modules.root.state.
    //比较关键的是第三个参数是传入的 path 的拷贝对象，这样能保证 installModule() 调用时，能保证 path 就是对应child参数的路径。
    installModule(store, rootState, path.concat(key), child, hot);
  });
}

/**
 * makeLocalContext: 用于查找指定的 namespace 下能否找到对应的 Module 下的 state, getters, commit, dispatch。
 * store：    new Vuex.Store() 实例。
 * namespace: 当前module转换成的命名空间，比如： “/user/info”。
 * path:      对应为 ["user", "info"]
 *
 * 这个函数中的 local 定义的四个属性 dispatch、commit、getter、state 因为处于闭包环境，特别不好理解。
 * ==> 每一个 module 就对应一个 local，也就是 module.context; 此时这个 module 的 path，namesapce 全部被闭包环境获取。
 * ==> 当通过 local 的方式调用 dispatch、commit、getter、state 时，可以认为能自动识别当前 module 对应的 path，namespace。
 */
function makeLocalContext(store, namespace, path) {
  //如果命名空间的长度为空。出现 namespace 为 “” 的两种条件：
  //1、根 module 的 namespace 为空。
  //2、祖-父-自己 的 namespace 都是为空。
  const noNamespace = namespace === "";

  /**
   * 1、actions, mutations 都是通过 namespace 作为 key 被 store._actions, store._mutations 存储。
   *    所以如果 namespaces 为空，则当作属性直接存在了 store._action, store._mutations 中, 而不是 _children 中。
   */
  const local = {
    dispatch: noNamespace
      ? store.dispatch
      : /*
          参数： 外部传入
        */
        (_type, _payload, _options) => {
          //对传入的 _type 进行处理，如果是字符串就不处理；
          //    如果 _type 是不为null的对象，则取 _type.type 作为 key。
          const args = unifyObjectStyle(_type, _payload, _options);
          const { payload, options } = args;
          //获取外部传入的 key。
          let { type } = args;

          // options 不存在或者 options.root 不存在的时候，就将 key 转化为 完整的命名空间名称。
          if (!options || !options.root) {
            //如果是通过 local.dispatch, 或者 this.context.dispatch ，则 path 是当前的module对应的key就行。
            type = namespace + type;
            //如果是开发环境，且 store._actions 中不存在对应的 key-value.
            if (__DEV__ && !store._actions[type]) {
              console.error(
                `[vuex] unknown local action type: ${args.type}, global type: ${type}`
              );
              return;
            }
          }

          //主要是将通过 local.dispatch, this.context.dispatch 方式调用 action 的行为矫正。
          //将type转化为正确的 namespace，来查找 store._actions 中的 wrappedActionHandler
          return store.dispatch(type, payload);
        },

    commit: noNamespace
      ? store.commit
      : (_type, _payload, _options) => {
          //对传入的 _type 进行处理，如果是字符串就不处理；
          // 如果 _type 是不为null的对象，则取 _type.type 作为 key。
          const args = unifyObjectStyle(_type, _payload, _options);

          const { payload, options } = args;
          let { type } = args;

          // options 不存在或者 options.root 不存在的时候，就将 key 转化为 完整的命名空间名称。
          if (!options || !options.root) {
            //如果是通过 local.dispatch, 或者 this.context.dispatch ，则 path 是当前的module对应的key就行。
            type = namespace + type;
            //如果是开发环境，且 store._mutations 中不存在对应的 key-value.
            if (__DEV__ && !store._mutations[type]) {
              console.error(
                `[vuex] unknown local mutation type: ${args.type}, global type: ${type}`
              );
              return;
            }
          }
          //主要是将通过 local.commit, this.context.commit 方式调用 action 的行为矫正。
          //将 type 转化为正确的 namespace，来查找 store._mutation 中的 wrappedMutationHandler
          store.commit(type, payload, options);
        },
  };

  /**
   * getters 和 state 必须是懒加载方式获取的，因为它们将会在 vm 更新的时候被改变。
   */
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace),
    },
    state: {
      /*
         因为 state 的数据是没有被收集到 store 的，所以只能够通过 path 来逐级查找。
         installModule(){} 方法中只搜集了所有module中的 mutations, actions, getters, 并没有 state.

         也就是说： 找子 module 的 state 数据，只能通过 path 来找。
                  找子 module 的 getters, mutations, actions 数据，则通过 namespace 来找。
      */
      get: () => getNestedState(store.state, path),
    },
  });
  return local;
}

/**
 * 本地就是指对应的 module。获取本地的 getter。
 * 关于 makeLocalGetters() 函数中的 namespace 与 tpye。
 * 1、namespace 就是外部调用getter是传入的完整命名空间，比如 "/user/info/getName".
 * 2、而type，是用来存储对应 store.getters 中的key，是 “namespace+key”。 也就是 "/user/info", 当然 getter 的名称为 getName。
 *
 * 因为是通过 local 的方式获取 getter，所以不需要 namespace，只需要 key 就行。不过会通过代理的方式还是访问了 store.getters[type]。
 * 也就是说本地通过 key 获取 getter 的方式，会被代理转换为通过完整的 namespace 在 store.getters 中查找 getter。
 */
function makeLocalGetters(store, namespace) {
  //_makeLocalGettersCache 中不存在该 namespace 的 getter。
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {};
    //获取namespace的长度。
    const splitPos = namespace.length;
    //遍历 this._vm.getters
    Object.keys(store.getters).forEach((type) => {
      //获取type的前缀，如果与 namespace 不相等，则循环下一个。
      //关于 slice( start, end ) 也可以用来截取字符串生成子串。相当于 substring(stat, end)
      if (type.slice(0, splitPos) !== namespace) return;

      //截取 type 的 slice( splitPos, type.length ) 的子串。第二个参数默认就是字符串末尾。
      const localType = type.slice(splitPos);

      /*
        外部通过 local.getter, 使用 getter 的名称 key 来访问，能够被转为 namespace+key 的形式在 store.getter 中获取 getter 方法。
      */
      Object.defineProperty(gettersProxy, localType, {
        //被代理到了 store.getters 上。  store.getters  是 store._vm 的计算属性computed。
        get: () => store.getters[type],
        //允许遍历
        enumerable: true,
      });
    });
    //将该 namespace 获取到的 getter map 存储到 _makeLocalGettersCache 中。
    store._makeLocalGettersCache[namespace] = gettersProxy;
  }

  //将 gettersProxy 返回。 强调的是： gettersProxy 的所有方法，是来自于 store._vm 的计算属性 computed 的。
  return store._makeLocalGettersCache[namespace];
}

/**
 * 1、将 mutation 注册到 stote._mutations 中, store._mutations 是一个 map 对象。
 * 2、用户定义的 mutation(){} 的第一个参数，只有当前子 module 对应的 state。
 * 第一个参数：store： 指的是 new Vuex.Store() 实例。
 * 第二个参数：type:   为 namespacedType, 形式为： “/user/info/updateAge”。
 * 第三个参数：handler: mutations 中属性对应的 value，就 mutation 函数。
 * 第四个参数：local:
 *
 */
function registerMutation(store, type, handler, local) {
  //1、store._mutations 是一个 map。
  //2、store._mutations 中的 key 对应的 value，是一个数组。表明可以允许多个
  //    同名 key 的 mutation 函数存在。
  //3、用户自定义的 mutation 方法，会被装饰增强为
  //     function wrappedMutationHandler( payload ){ ... }
  //store._mutations["/user/info/updateAge"] 的值是个数组。
  const entry = store._mutations[type] || (store._mutations[type] = []);
  //对用户定义的 mutation 进行装饰，保证 mutation 内部的this，一定指向 store 实例。
  /*
     我们定义的mutation，在被调用的时候，只能接受一个参数。
     payload，负载，表示要传递过来的参数。
   */
  entry.push(function wrappedMutationHandler(payload) {
    //mutation中函数的第一个参数是 state， 第二个参数是 payload。
    handler.call(store, local.state, payload);
  });
}

/***
 * 1、将 Action 注册到 store._actions 中，其中 store._actions 是一个 map。
 * 2、如果 action 是一个对象，且 root=true，则key，就不是完整命名空间的名称，而是“/”的最后一截。
 * 3、用户定义的 action， 会被包装为 function wrappedActionHandler(payload){...}。
 * 4、用户定义的 action(){ }, 第一个参数包含如下属性：
 *      { 本module的   dispatch,   local.dispatch 的 type 只有 action 的 key。但是会被转化为 namespace+key的形式。最终调用形式为 store.dispatch('namespace+key', xxxx)
 *        本module的   commit,     同 local.dispatch.
 *        本module的   getters,    会将所有的 local.getter 存储到一个对象，对象的属性名就是 getter的名称，且会将这个对象存储到 store._makeLocalGettersCache[namespace]中,
 *        本module的   state，     state是没有被收集的，所有只能通过 path 数组查找 state。
 *        rootModule的 getters,
 *        rootModule的 state
 *      }
 *    第二个参数 payload 为 数据。
 */
function registerAction(store, type, handler, local) {
  //如果 store._actions[type] 不存在，则初始化为 []。
  const entry = store._actions[type] || (store._actions[type] = []);
  //同一个key，可以存在多个 action 方法。
  entry.push(function wrappedActionHandler(payload) {
    //用户自定义的 action 开始执行。
    let res = handler.call(
      store,
      {
        dispatch: local.dispatch,
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state,
      },
      payload
    );

    //如果当前的 action 不是一个 promise 方法(即异步方法)。
    if (!isPromise(res)) {
      //则包装成为一个 promise 对象。
      res = Promise.resolve(res);
    }

    // devtool 工具出发 vuex:error
    if (store._devtoolHook) {
      //则promiseshying catch 方法进行异常捕获处理。
      return res.catch((err) => {
        store._devtoolHook.emit("vuex:error", err);
        throw err;
      });
    } else {
      //将 mutation 调用的结果返回，返回的结果是个 promise 对象。
      return res;
    }
  });
}

/*
  1、相同key的mutation可以注册多个，但是getter的只允许最先的注册。
  2、用户定义的getter，实际上接受了四个参数。{
      本module的state，
      本module的getters，
      根module的state,
      根module的getters
  }
  3、用户定义的getter，会被包装为 function wrappedGetter(){ ... }
*/
function registerGetter(store, type, rawGetter, local) {
  //判断是否重复注册 getter。
  if (store._wrappedGetters[type]) {
    if (__DEV__) {
      console.error(`[vuex] duplicate getter key: ${type}`);
    }
    return;
  }
  //将所有的 getter 全部收集到 _wrappedGetters 对象中。
  store._wrappedGetters[type] = function wrappedGetter(store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    );
  };
}

/*
  watch对象的建立：
  1、第一个参数： 要监听的数据，即 state。
  2、第二个参数： 当数据发生变化时，会触发该方法的调用；如果此时 _committing 属性为 false，则没有根据单向数据流的方式进行数据更新。
  3、第三个参数： 配置参数。 deep=true，表示监听 state 中的所有属性以及子孙属性。
*/
function enableStrictMode(store) {
  //新增加一个观察者，用于观察 _vm 中的 data 数据中的 $$state 是否是通过 commit 形式才发生的改变。
  store._vm.$watch(
    //第一个参数就是 state 数据。
    function () {
      return this._data.$$state;
    },
    //第二个参数，如果数据发生改变，则会回调第二个参数对应的函数。
    () => {
      //如果是开发者模式，如果 store._committing 为false，则报红。
      if (__DEV__) {
        assert(
          store._committing,
          `do not mutate vuex store state outside mutation handlers.`
        );
      }
    },

    //深度监听 state 对象的所有属性，以及子属性。
    { deep: true, sync: true }
  );
}

/**
 * 获取嵌套的 state
 * path 去除了最后一项。
 *
 * ["namespace1", "namespace2", "namespace3"].reduce( ( state, key )=>state[key] )
 */
function getNestedState(state, path) {
  return path.reduce((state, key) => state[key], state);
}

/*
  unifyObjectStyle: 将对象类型进行统一。

*/
function unifyObjectStyle(type, payload, options) {
  //如果type是不为null的对象类型。（字符串的类型就是string），则去type.type 作为命名空间字符串。
  if (isObject(type) && type.type) {
    //则将type认为是 携带的数据 payload。
    options = payload;
    //payload 则认为是 配置参数 options。
    payload = type;
    //将 type.type 作为命名空间。
    type = type.type;
  }

  //开发模式下，判断如果 type 不是字符串类型，则报警告提示type不是string类型。
  if (__DEV__) {
    assert(
      typeof type === "string",
      `expects string as the type, but found ${typeof type}.`
    );
  }

  return { type, payload, options };
}

/***
 * Vuex 走的第一步，就是这个方法，通过 Vue.use( vuex ) 时，会调用 vuex.install( _Vue ) 方法。
 */
export function install(_Vue) {
  //对同一个vue进行重复使用了 vue.use(Vuex), 开发环境内报错误提示。
  if (Vue && _Vue === Vue) {
    if (__DEV__) {
      console.error(
        "[vuex] already installed. Vue.use(Vuex) should be called only once."
      );
    }
    return;
  }

  //在 Vuex.Store 中记录 Vue 类对象。
  Vue = _Vue;
  //在每一个 vue 实例被创建的时候，混合一个 Vuex.Store() 实例。
  //对应位置为 ./mixin.js 文件。
  applyMixin(Vue);
}
