/**
 *   Store.js 中 applyMixin(Vue) 对应的方法。 
 *   applyMixin(Vue)  =======>
 */
export default function (Vue) {
  //获取版本
  const version = Number(Vue.version.split('.')[0])
  //如果版本是 2.xx 以上，就走 Vue.mixin(xxx) 方法。
  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit })
  } else {

    //1.xx 版本时候的处理，可以不看了。
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }

  /**
   *  Vue.mixin({ beforeCreate: vuexInit }) =====> 
   */
  function vuexInit () {
    /** 需要注意的是: 
       1、此时是在 vue 实例的内部，this指向的是刚创建出来的 vue 实力。所以 this.$options 是指 vue 实例的 options 参数。
       2、此时的 vue 的生命周期为 beforeCreate, 也就是说在 created(){} 生命周期的时间内，就可以使用 this.$store 属性了 。
    */
    const options = this.$options
    //功能： 将 Vuex.Store() 实例在 vue 实例上进行挂在。
    //1、先判断当前 vue 实例的 options参数上是否有 store 属性；
    //   如果当前 vue 实例的 options参数上的 store 属性是个函数，就调用；否则，就直接赋值给 this.$store.
    if (options.store) {
      //
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
      
    //2、如果当前 vue 实例的 options参数上没有 store 属性；
    //   则去查询父组建是否含有  $store 属性，如果有，则获取父组建的 $store。
    } else if (options.parent && options.parent.$store) {
      //这里为什么不需要逐级往上找了？因为组建创建的过程是一个自顶向下的过程，会将 $store 属性逐步完成从父组建传递到子组件的过程。 
      this.$store = options.parent.$store
    }
  }
}
