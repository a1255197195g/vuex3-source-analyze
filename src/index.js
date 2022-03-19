import { Store, install } from './store'
import { mapState, mapMutations, mapGetters, mapActions, createNamespacedHelpers } from './helpers'
import createLogger from './plugins/logger'



/***
 * 这个就是 Vuex 类的文件。
 * 第一步是  vue.use(Vuex), 所以先走 Vuex 的 install() 方法。
 * 第二步是  new Vuex.Store( options ), 所以走 Store 的 构造方法，走vuex数据初始化流程。
 * 第三步是  各种 this.$store.state, this.$store.getters, this.$store.commit, this.$store.dispatch,所以走 vuex 数据的流转流程。 
 */
export default {
  //Vuex.Store 对应的 Store 类对象。
  Store,
  //这个是 Vue.use(vuex) 时，被调用的 vuex.install 方法。
  install,
  //版本
  version: '__VERSION__',
  //import { mapState, mapMutations, mapGetters, mapActions } from 'vuex' 的四个辅助函数
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  //表示当前的vuex只会从 createNamespacedHelpers("namespaces") 中指定的命名空间 namespaces 中获取 state, getters, actions, mutations
  createNamespacedHelpers,
  //引入日志插件后，每次操作state中的值，都会打印数据状态，并且会区别是actions还是mutations。如果是子模块会在方法名前加上子模块名。
  createLogger
}

//Vuex实例对外暴露的属性如下。
export {
  Store,
  install,
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers,
  createLogger
}


/*
  createNamespacedHelpers 的使用

  import { createNamespacedHelper } from "vuex";
  //namespaceValue 指的就是子模块名
  const { mapState, mapGetters, mapMutations, mapActions } = createNamespaceHelpers("namespaceValue");
  const { message, ...otherState } = mapState(["message", "otherState1", "otherState2"]);
  const { updateMessage, ...otherMutations } = mapMutations(["updateMessage", "otherMutation1", "otherMutations2"]) 


当然，对于Store中的子模块读取属性，还有如下方式：
  import { mapState, mapGetters } from 'vuex'
  computed: {
    ...mapState("publish", ["fileObj", "nowUploadType"]),
    ...mapGetters("publish", ["getFileObjMax", "fileList"]),
  }
*/


/*
  createLogger 的使用

  import { createLogger } from 'vuex';
  const store = new Vuex.store({
    state: { number: 100, name: '小明' },
    mutations: {
      setNumber( state, val ){
        state.number++;
      },
      changeName( state, val ){
        state.name = val;
      }
    },
    actions: {
      updateNumber( { commit, state }, val ){
        state.number++;
      }
    },
    plugins: process.env.NODE_DEV !== 'production' ? [createLogger()]:[],
    strict: true
  });

  export default store;

  1、引入日志插件后，每次操作state中的值，都会打印数据状态，并且会区别是actions还是mutations。如果是子模块会在方法名前加上子模块名。
  2、strict: true 设置严格模式后，actions中不能直接通过 state.name = val 去修改state中的值，而要通过commit去触发mutations中的方法修改state，否则报错。
*/
