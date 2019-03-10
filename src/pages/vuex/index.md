---
title: Vuex 源码解析
date: '2018-06-28'
spoiler: `Vuex` 是一个专为 `Vue.js` 应用程序开发的状态管理模式。它采用集中式存储管理应用的所有组件的状态，并以相应的规则保证状态以一种可预测的方式发生变化。
---

## Vuex 是什么？

`Vuex` 是一个专为 `Vue.js` 应用程序开发的状态管理模式。它采用集中式存储管理应用的所有组件的状态，并以相应的规则保证状态以一种可预测的方式发生变化。

<p align="center">
  <img width="700px" src="https://raw.githubusercontent.com/vuejs/vuex/dev/docs/.vuepress/public/vuex.png">
</p>

> [阅读 vuex 源码的思维导图:](https://sailor-1256168624.cos.ap-chengdu.myqcloud.com/blog/vuex.png)

![阅读 vuex 源码的思维导图](https://sailor-1256168624.cos.ap-chengdu.myqcloud.com/blog/vuex-mini.png)

[vuex 的文档](https://vuex.vuejs.org/zh/) 对辅助看源码有不小的帮助，不妨在看源码之前仔细地撸一遍文档。

## 带着问题去看源码

- 1. global event bus 有何缺陷
- 2. \$store 如何注入到所有子组件
- 3. mapState 实现
- 4. mapGetter 如何映射
- 5. Mutation 同步 && Action 异步
- 6. dispatch 方法实现
- 7. module 分割实现 && 局部状态 namespaced
- 8. 如何调用 vue-devtools
- 9. 内置 logger 插件实现
- 10. hotUpdate
- 11. 时间穿梭功能实现

## 目录

```bash
├── src
│   ├── helpers.js                  辅助函数
│   ├── index.esm.js
│   ├── index.js                    入口
│   ├── mixin.js                    混入 vuexInit
│   ├── module                      class module
│   │   ├── module-collection.js
│   │   └── module.js
│   ├── plugins                     插件
│   │   ├── devtool.js
│   │   └── logger.js
│   ├── store.js                    store install
│   └── util.js                     工具函数
```

## 入口文件

vuex 的入口文件在 `src/index.js`

```js
import { Store, install } from './store'
import {
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers
} from './helpers'

export default {
  Store,
  install,
  version: '__VERSION__',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers
}
```

`index.js` 引入了 `Store` 、`install` 和一些辅助工具函数，并将引入的变量组装成一个对象向外暴露。

当我们在项目中引入 `import Vuex from 'vuex'` 的之后， `Vuex` 就是这个组装后默认导出的对象了。

当然我们也可以通过解构的方式：

```js
import { Store, install } from 'vuex'`
```

## install 方法

来看一下 `install` 方法，在 `src/store.js` 。

```js
export function install(_Vue) {
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  Vue = _Vue
  // vuexInit
  applyMixin(Vue)
}
```

`install` 方法首先判断变量 `Vue` (`store.js` 顶部申明的变量) 是否与传入 `_Vue` 全等，如果全等并且在非生产环境，抛出异常。

随后将传入的 `_Vue` 赋值给 `Vue`，这里主要是为了避免重复安装。

然后调用引入的 `applyMixin` 方法，并将 `Vue` 作为参数传入。

`applyMixin` 在 `src/mixin.js` 作为默认方法导出：

```js
export default function(Vue) {
  const version = Number(Vue.version.split('.')[0])
  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function(options = {}) {
      options.init = options.init ? [vuexInit].concat(options.init) : vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   */

  function vuexInit() {
    const options = this.$options
    if (options.store) {
      this.$store =
        typeof options.store === 'function' ? options.store() : options.store
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
  }
}
```

取出传入 `Vue` 的 静态属性 `version` 做不同处理。

2.0 采用 `mixin` 将 `vuexInit` 合并到 `beforeCreate` 生命周期钩子。

1.0 重写 `_init` 方法 将 `vuexInit` 合并到 `_init` 方法中。

在 `vuexInit` 方法中，首先判断如果有 `options.store` 说明是 `root` 节点，并且判断 `store` 是 `function` 就执行将函数返回值赋值给 `this.$store` ，否则 `options.store` 直接赋值。
然后判断有父节点，并且父节点有 `$store`, 就将父节点的 `$store` 赋值给 `this.$store` ，这样就保证只有一个全局的 `$store` 变量。

## class Store

我们在使用 `Vuex` 的时候，会实例化 `Store` 类，并且将一些 `options` 作为参数传入。

```js
export class Store {
  constructor(options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    if (process.env.NODE_ENV !== 'production') {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(
        typeof Promise !== 'undefined',
        `vuex requires a Promise polyfill in this browser.`
      )
      assert(
        this instanceof Store,
        `store must be called with the new operator.`
      )
    }

    const { plugins = [], strict = false } = options

    // store internal state
    this._committing = false
    this._actions = Object.create(null)
    this._actionSubscribers = []
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    this._modules = new ModuleCollection(options)
    this._modulesNamespaceMap = Object.create(null)
    this._subscribers = []
    this._watcherVM = new Vue()

    // bind commit and dispatch to self
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch(type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit(type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    this.strict = strict

    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    installModule(this, state, [], this._modules.root)

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    resetStoreVM(this, state)

    // apply plugins
    plugins.forEach(plugin => plugin(this))

    if (Vue.config.devtools) {
      devtoolPlugin(this)
    }
  }
}
```

我们来逐行看一下 `Store` 构造函数中的 `constructor` 代码。

```js
if (!Vue && typeof window !== 'undefined' && window.Vue) {
  install(window.Vue)
}
```

判断 `store.js` 开始申明的 `Vue` 变量、`window` 不为 `undefined` （说明在浏览器环境下）、`window` 上有 `Vue` 变量、如果全部符合就执行 `install` 方法进行自动安装。

这么做主要是为了防止在某些情况下避免自动安装，具体情况请看 [issues #731](https://github.com/vuejs/vuex/issues/731)

然后在非生产环境执行，运行一些断言函数。

```js
assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
```

判断当前 `Vue` 变量， 在创建 `store` 实例之前必须调用 `Vue.use(Vuex)`。

```js
assert(
  typeof Promise !== 'undefined',
  `vuex requires a Promise polyfill in this browser.`
)
```

判断支持 `Promise` 对象， 因为 `vuex` 的 `registerAction` 时会将不是 `Promise` 的方法包装成 `Promise` , `store` 实例的 `dispatch` 方法也使用了 `Promise.all`，这也是为什么 `action` 支持异步调用的原因。

```js
assert(this instanceof Store, `store must be called with the new operator.`)
```

判断 `this` 必须是 `Store` 的实例。

断言函数的实现非常简单。

```js
export function assert(condition, msg) {
  if (!condition) throw new Error(`[vuex] ${msg}`)
}
```

将传入的 `condition` 在函数内取非，为 `true` 就抛出异常。

接下来是从 `options` 解构出 `plugins` `strict`。

```js
const { plugins = [], strict = false } = options
```

`plugins`: `vuex` 的插件，数组，会在后面循环调用。

`strict`: 是否是严格模式，后面判断如果是严格模式的会执行 `enableStrictMode` 方法，确保只能通过 `mutation` 操作 `state`。

接下来就是一些初始参数的赋值。

```js
// 通过 mutation 修改 state 的标识
this._committing = false
// 注册 action 储存到 _actions
this._actions = Object.create(null)
// 储存订阅 store 的 action
this._actionSubscribers = []
// 注册 mutation 储存到 _mutations
this._mutations = Object.create(null)
// 注册 getter 储存到 _wrappedGetters
this._wrappedGetters = Object.create(null)
// ModuleCollection 实例解析后的 modules 模块收集器
this._modules = new ModuleCollection(options)
// 在 installModule 函数中 如果有命名空间就储存到 _modulesNamespaceMap 中
this._modulesNamespaceMap = Object.create(null)
// 储存订阅者
this._subscribers = []
// 用 Vue 实例 实现 Store 的 watch 方法
this._watcherVM = new Vue()
```

使用 `call` 将 `dispatch` `commit` 的 `this` 绑定到当前的 `Store` 实例上。

```js
// bind commit and dispatch to self
const store = this
const { dispatch, commit } = this
this.dispatch = function boundDispatch(type, payload) {
  return dispatch.call(store, type, payload)
}
this.commit = function boundCommit(type, payload, options) {
  return commit.call(store, type, payload, options)
}
```

将解构出的 `strict` 变量赋值给 `this.strict` ，会在实例中使用。

```js
// strict mode
this.strict = strict
```

### init module

接下来会调用 `installModule` 安装 `modules`。

```js
// init root module.
// this also recursively registers all sub-modules
// and collects all module getters inside this._wrappedGetters
installModule(this, state, [], this._modules.root)
```

第一次调用将 `this`、`state`（`this._modules.root.state`）、空数组、`this._modules.root`（`root module`）作为参数传入。

`installModule` 代码：

```js
function installModule(store, rootState, path, module, hot) {
  const isRoot = !path.length
  const namespace = store._modules.getNamespace(path)

  // register in namespace map
  if (module.namespaced) {
    store._modulesNamespaceMap[namespace] = module
  }

  // set state
  if (!isRoot && !hot) {
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      Vue.set(parentState, moduleName, module.state)
    })
  }

  const local = (module.context = makeLocalContext(store, namespace, path))

  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })

  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}
```

首先先根据 `path` 判断是否是 `root`，刚开始传入的 `path` 为空数组， 所以是 `isRoot = true`,
随后调用 `ModuleCollection` 类的 `getNamespace` 方法 根据 `path` 获取命名空间，因为 `this._modules` 是 `ModuleCollection` 类的实例。

接着判断 `module.namespaced` 是否为 `true`, `namespaced` 是在每个 `module` 的配置中设置的，如果为 `true` 就将 `namespace` 赋值为 `key`、`module` 为值存到 `construction` 的 `_modulesNamespaceMap` 变量上。

在 `helper.js` 我们会用 `getModuleByNamespace` 获取 `_modulesNamespaceMap` 下对应命名空间模块。

```js
// set state
if (!isRoot && !hot) {
  const parentState = getNestedState(rootState, path.slice(0, -1))
  const moduleName = path[path.length - 1]
  store._withCommit(() => {
    Vue.set(parentState, moduleName, module.state)
  })
}
```

非 `root module` 并且没有 `hot` 热更新，初始化的时候并没有进入 `if` 判断，注册子模块的时候才会进入
调用 `getNestedState` 方法取出父 `module` 的 `state`。

`path` 是一个数组，按模块嵌套排列，`path.slice(0, -1)` 传入除去自身的数组，就是父级。

```js
function getNestedState(state, path) {
  return path.length ? path.reduce((state, key) => state[key], state) : state
}
```

`getNestedState` 返回一个三元表达式，如果有 `path.length` 就调用
`reduce` 方法取出对应嵌套的 `state` ，没有返回直接传入的 `state`。

然后调用 `store` 的 `_withCommit` 方法：

```js
_withCommit (fn) {
  const committing = this._committing
  this._committing = true
  fn()
  this._committing = committing
}
```

`_withCommit` 中执行传入的 `fn` 之前会将 `this._committing` 置为 `true` ，执行 `fn` 函数后，将 `committing` 回复恢复之前的状态。
这里主要是为了保证修改 `state` 只能通过调用 `_withCommit`，会调用 `enableStrictMode` 去检测 `state` 是否以预期的方式改变，我们在使用 `vuex` 中，就是通过 `mutation` 去改变 `state`。

调用 `makeLocalContext` 方法：

```js
const local = (module.context = makeLocalContext(store, namespace, path))
```

`makeLocalContext` 主要用来初始化 `dispatch`、`getter`、`commit`、`state`，通过 `defineProperties` 劫持 `getters`、`state`。

```js
/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
function makeLocalContext(store, namespace, path) {
  const noNamespace = namespace === ''

  const local = {
    dispatch: noNamespace
      ? store.dispatch
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options)
          const { payload, options } = args
          let { type } = args

          if (!options || !options.root) {
            type = namespace + type
            if (
              process.env.NODE_ENV !== 'production' &&
              !store._actions[type]
            ) {
              console.error(
                `[vuex] unknown local action type: ${
                  args.type
                }, global type: ${type}`
              )
              return
            }
          }

          return store.dispatch(type, payload)
        },

    commit: noNamespace
      ? store.commit
      : (_type, _payload, _options) => {
          const args = unifyObjectStyle(_type, _payload, _options)
          const { payload, options } = args
          let { type } = args

          if (!options || !options.root) {
            type = namespace + type
            if (
              process.env.NODE_ENV !== 'production' &&
              !store._mutations[type]
            ) {
              console.error(
                `[vuex] unknown local mutation type: ${
                  args.type
                }, global type: ${type}`
              )
              return
            }
          }

          store.commit(type, payload, options)
        }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}
```

声明 `noNamespace` 变量判断是否有命名空间，然后创建 `local` 对象，改对象有两个属性 `dispatch` `commit`，它们的值分别是 2 个三元表达式，如果是没有命名空间的，`dispatch` 就赋值为 `store.dispatch`，有命名空间就拼上再返回，`commit` 也是一样的道理。

然后通过 `Object.defineProperties` 劫持 `local` 对象的 `getters`、`state`。

```js
// getters and state object must be gotten lazily
// because they will be changed by vm update
Object.defineProperties(local, {
  getters: {
    get: noNamespace
      ? () => store.getters
      : () => makeLocalGetters(store, namespace)
  },
  state: {
    get: () => getNestedState(store.state, path)
  }
})
```

劫持 `getters` 的时候也是一个三元表达式，没有命名空间就将 `local` 的 `getters` 代理到 `store.getters` 上，有的话就将 `local` 的 `getters` 代理到 `makeLocalGetters` 函数的返回上。

我们来看一下 `makeLocalGetters` 方法：

```js
function makeLocalGetters(store, namespace) {
  const gettersProxy = {}

  const splitPos = namespace.length
  Object.keys(store.getters).forEach(type => {
    // skip if the target getter is not match this namespace
    if (type.slice(0, splitPos) !== namespace) return

    // extract local getter type
    const localType = type.slice(splitPos)

    // Add a port to the getters proxy.
    // Define as getter property because
    // we do not want to evaluate the getters in this time.
    Object.defineProperty(gettersProxy, localType, {
      get: () => store.getters[type],
      enumerable: true
    })
  })

  return gettersProxy
}
```

`makeLocalGetters` 接收 `store` 和 `namespace` 作为参数。
首先申明 `gettersProxy` 变量，申明 `splitPos` 变量为命名空间长度，随后遍历 `store.getters` ,
匹配命名空间，失败就 `return` ，成功往下执行。

然后取出命名空间后的 `getter`、`type`，使用 `defineProperty` 为 `gettersProxy` 的 `localType` 添加 `get` 方法，劫持 `gettersProxy` 的 `localType` 的 `get` 返回 `store` 上对应的 `getter`，简单来说就是做了一个有命名空间情况下的代理。

`makeLocalContext` 函数最后会将 `local` 返回。

```js
const local = (module.context = makeLocalContext(store, namespace, path))
```

将 `makeLocalContext` 返回保存到 `local`、`module.context`。

下面就是循环注册 `mutation`、`action`、`getter`。

```js
module.forEachMutation((mutation, key) => {
  const namespacedType = namespace + key
  registerMutation(store, namespacedType, mutation, local)
})

module.forEachAction((action, key) => {
  const type = action.root ? key : namespace + key
  const handler = action.handler || action
  registerAction(store, type, handler, local)
})

module.forEachGetter((getter, key) => {
  const namespacedType = namespace + key
  registerGetter(store, namespacedType, getter, local)
})
```

调用 `module` 类的 `forEachMutation`、`forEachAction`、`forEachGetter`，取出对应的 `mutations`、`actions`、`getters` 和回调函数作为参数。

来看看 `registerMutation` 方法:

```js
function registerMutation(store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = [])
  entry.push(function wrappedMutationHandler(payload) {
    handler.call(store, local.state, payload)
  })
}
```

通过 `type` 取出 `store._mutations` 上对应的 `mutation`，没有就穿透赋值为空数组，然后将 `wrappedMutationHandler` 函数 `push` 到 `entry` 数组中，函数的参数也就是 `mutation` 时候的参数。

函数中调用 `call` 将 `handler` 函数 `this` 指向 `store`, 并将 `local.state`，`payload` 作为参数传入，这样 `_mutations[types]` 储存了所有的 `mutation`。

来看看 `registerMutation` 方法:

```js
function registerAction(store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler(payload, cb) {
    let res = handler.call(
      store,
      {
        dispatch: local.dispatch,
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state
      },
      payload,
      cb
    )
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}
```

通过 `type` 取出 `store._actions` 上对应的 `action`，没有就穿透赋值为空数组，然后将 `wrappedActionHandler` 函数 `push` 到 `entry` 数组中，函数中使用 `call` 将 `handler` 指向 `store`, `call` 的第二个参数是 `dispatch`、`commit`、`getters` 等包装后的对象，所以我们可以在 `commit` 的第一个参数中解构出需要的属性。

```js
// actions
const actions = {
  getAllProducts({ commit }) {
    shop.getProducts(products => {
      commit('setProducts', products)
    })
  }
}
```

`payload` 也就是额外参数，`cb` 回调函数倒是不怎么用到。

然后通过简易的 `isPromise` 方法判断 `res` 是否为 `Promise`，只是简单判断了 `then` 是是否为一个函数。

```js
export function isPromise(val) {
  return val && typeof val.then === 'function'
}
```

如果不是的话，调用 `Promise.resolve(res)` 将 `res` 包装成一个 `Promise`。

之后就是根据 `_devtoolHook` 判断当前浏览器是否有 `devtoolHook` 插件，应该是通过 `Promise.catch` 抛出错误，让 `devtoolHook` 捕获。

来看看 `registerGetter` 方法：

```js
function registerGetter(store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  store._wrappedGetters[type] = function wrappedGetter(store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}
```

开始判断如果有相同 `getter` 就抛出异常，
没有的话就以 `type` 为 `key`、`wrappedGetter` 为 `value` 储存到 `store._wrappedGetters` 对象上，每一个 `getter` 都是一个 `function`。

循环注册 `mutation action getter` 后，只剩下最后一段代码：

```js
module.forEachChild((child, key) => {
  installModule(store, rootState, path.concat(key), child, hot)
})
```

调用 `Module` 类的 `forEachChild` 方法，并且将回调函数传入。

```js
forEachChild (fn) {
  forEachValue(this._children, fn)
}
```

`forEachChild` 方法也调用了 `forEachValue` 遍历 `_children` 的 `key` 循环调用传入的 `fn`。

`_children` 是在 `ModuleCollection` 类中通过嵌套模块的递归注册建立父子关系的。

最后递归调用 `installModule` 完成所以嵌套模块的安装，到此 `installModule` 方法结束。

### resetStoreVM

`resetStoreVM` 主要用来重置 `Vue` 实例，实现响应式的 `state` `computed`。

```js
// initialize the store vm, which is responsible for the reactivity
// (also registers _wrappedGetters as computed properties)
resetStoreVM(this, state)
```

我们接着来看 `resetStoreVM` 方法：

```js
function resetStoreVM(store, state, hot) {
  const oldVm = store._vm

  // bind store public getters
  store.getters = {}
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    computed[key] = () => fn(store)
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent
  Vue.config.silent = true
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  // enable strict mode for new vm
  if (store.strict) {
    enableStrictMode(store)
  }

  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    Vue.nextTick(() => oldVm.$destroy())
  }
}
```

函数开始就取出 `store._vm`，初始值是 `undefind`，会在后面用到。

循环 `wrappedGetters` 处理所有 `getter`。

```js
// bind store public getters
store.getters = {}
const wrappedGetters = store._wrappedGetters
const computed = {}
forEachValue(wrappedGetters, (fn, key) => {
  // use computed to leverage its lazy-caching mechanism
  computed[key] = () => fn(store)
  Object.defineProperty(store.getters, key, {
    get: () => store._vm[key],
    enumerable: true // for local getters
  })
})
```

将 `store` 的 `getters` 赋值为空对象， 取出保存所有注册 `getter` 的 `_wrappedGetters` 对象，申明 `computed` 对象。

接着循环 `wrappedGetters` 对象，将对应的 `key` 以及 `fn` 保存到 `computed`，这里的 `fn` 就是注册 `getter` 的 `wrappedGetter` 函数。

```js
computed[key] = () => fn(store)
```

然后通过 `defineProperty` 劫持 `store.getters` 的 `key`，代理到 `store._vm[key]`。

```js
// use a Vue instance to store the state tree
// suppress warnings just in case the user has added
// some funky global mixins
const silent = Vue.config.silent
Vue.config.silent = true
store._vm = new Vue({
  data: {
    $$state: state
  },
  computed
})
Vue.config.silent = silent
```

保存 `Vue.config.silent` 变量，设置`Vue.config.silent = true`，取消 `Vue` 所有的日志与警告。

然后生成一个新的 `Vue` 实例，将 `state` 和 `computed` 作为参数传入，恢复 `Vue.config.silent`。因为将 `store.getters` 的 `key` 代理到 `store._vm[key]`，所以我们可以通过访问 `this.$store.getters.key` 访问到 `store._vm[key]`。

```js
// enable strict mode for new vm
if (store.strict) {
  enableStrictMode(store)
}
```

根据 `store.strict` 判断是否是严格模式，是的话调用 `enableStrictMode` 方法。

```js
function enableStrictMode(store) {
  store._vm.$watch(
    function() {
      return this._data.$$state
    },
    () => {
      if (process.env.NODE_ENV !== 'production') {
        assert(
          store._committing,
          `do not mutate vuex store state outside mutation handlers.`
        )
      }
    },
    { deep: true, sync: true }
  )
}
```

`enableStrictMode` 将 `store` 作为参数，调用 `store._vm.$watch` 方法，也就是 `Vue` 实例的 `$watch` 方法，监测 `this._data.$$state` 的变化，就是生成新的 `Vue` 实例的时候传入的 `state`，判断不是生产模式，调用断言，如果 `store._committing` 是 `false`, 抛出异常，所以我们在使用 `vuex` 的时候，只能通过 `mutation` 方式改变 `store`。

`oldVm` 的注销：

```js
if (oldVm) {
  if (hot) {
    // dispatch changes in all subscribed watchers
    // to force getter re-evaluation for hot reloading.
    store._withCommit(() => {
      oldVm._data.$$state = null
    })
  }
  Vue.nextTick(() => oldVm.$destroy())
}
```

如果有 `oldVm`, 并且是热更新模式，将 `oldVm._data.$$state` 置为 `null`，
接下来调用 `oldVm` 的 `$destroy` 方法注销 `oldVm` 实例。

插件的调用：

```js
// apply plugins
plugins.forEach(plugin => plugin(this))
```

循环传入的 `plugin` 数组，循环调用，并将 `this` 传入。

调用 `devtoolPlugin` 方法：

```js
if (Vue.config.devtools) {
  devtoolPlugin(this)
}
```

`constructor` 的末尾会判断 `Vue.config.devtools` 是否为真，调用 `devtoolPlugin` 方法，并将 `this` 作为参数传入，`devtoolPlugin` 实现请看 `插件 devtool` 部分。

至此 `Store` 类的 `constructor` 部分结束，我们往下来看看 `Store` 类中的方法。

代理 `state`:

```js
get state () {
  return this._vm._data.$$state
}
```

为 `state` 设置 `get`，访问 `Store` 实例的 `state` 的时候代理带 `this._vm._data.$$state`。

```js
set state (v) {
  if (process.env.NODE_ENV !== 'production') {
    assert(false, `use store.replaceState() to explicit replace store state.`)
  }
}
```

为 `state` 设置 `set`，不能直接修改 `state`， 非生产环境抛出异常，提示你使用 `store.replaceState` 方法修改 `state`。

### commit

修改 `Vuex` 的 `store` 只能通过 `mutation`，我们通过 `commit` 调用 `mutation`。

```js
commit (_type, _payload, _options) {
  // check object-style commit
  const {
    type,
    payload,
    options
  } = unifyObjectStyle(_type, _payload, _options)

  const mutation = { type, payload }
  const entry = this._mutations[type]
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] unknown mutation type: ${type}`)
    }
    return
  }
  this._withCommit(() => {
    entry.forEach(function commitIterator (handler) {
      handler(payload)
    })
  })
  this._subscribers.forEach(sub => sub(mutation, this.state))

  if (
    process.env.NODE_ENV !== 'production' &&
    options && options.silent
  ) {
    console.warn(
      `[vuex] mutation type: ${type}. Silent option has been removed. ` +
      'Use the filter functionality in the vue-devtools'
    )
  }
}
```

`commit` 接收 3 个参数，`_type` 就是 `mutation` 的 `type`，`_payload` 就是传入的参数，`_options` 参数会在下面调用，貌似没什么用处，只是用来判断是否 `console.warn`。

接下来调用 `unifyObjectStyle` 方法：

```js
function unifyObjectStyle(type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(
      typeof type === 'string',
      `expects string as the type, but found ${typeof type}.`
    )
  }

  return { type, payload, options }
}
```

接收 `commit` 的三个参数，判断 `type` 如果是一个对象，并且有 `type` 属性，将 `options` 赋值为 `payload`，`payload` 赋值为 `type`，`type` 赋值为 `type.type`。

因为 `vuex` 允许对象风格的提交方式：

```js
store.commit({
  type: 'increment',
  amount: 10
})
```

处理成这样的形式：

```js
store.commit('increment', {
  amount: 10
})
```

然后从 `unifyObjectStyle` 结构出 `type`、`payload`、`options`，将包装 `type`、`payload` 成一个对象赋值给 `mutation` 变量，申明 `entry` 变量从储存所有 `mutation` 的 `this._mutations` 取出对应 `type` 的 `mutation`，没有对应 `mutation` 就 `return`，如果在非生产环境，顺便抛出个异常。

```js
this._withCommit(() => {
  entry.forEach(function commitIterator(handler) {
    handler(payload)
  })
})
```

接着调用 `this._withCommit` 方法，并将回调函数传入，这里会循环对应的 `mutation`，将 `payload` 参数传入并调用 `handler` 函数，需要注意的是 `mutation` 只能是是同步函数。

接着循环 `_subscribers`：

```js
this._subscribers.forEach(sub => sub(mutation, this.state))
```

`_subscribers` 是一个数组，循环调用里面的函数，并将 `mutation` `this.state` 传入。

最后判断非生产环境，并且 `options.silent` 为真，就抛出异常，提示 `Silent option` 已经删除，应该是和 `vue-devtools` 有关。

### dispatch

通过 `store.dispatch` 方法触发 `Action`:

```js
dispatch (_type, _payload) {
  // check object-style dispatch
  const {
    type,
    payload
  } = unifyObjectStyle(_type, _payload)

  const action = { type, payload }
  const entry = this._actions[type]
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] unknown action type: ${type}`)
    }
    return
  }

  this._actionSubscribers.forEach(sub => sub(action, this.state))

  return entry.length > 1
    ? Promise.all(entry.map(handler => handler(payload)))
    : entry[0](payload)
}
```

`dispatch` 接收 2 个参数，`action type` 和 `_payload` 参数。

与 `commit` 一样调用 `unifyObjectStyle` 方法处理对象形式的 `dispatch`，解构出 `type` `payload`，申明 `action` 对象包装 `type` `payload`，申明 `entry` 变量从 `this._actions` 中取出对应的 `action`，没有对应 `action` 就 `return`，如果在非生产环境，顺便抛出个异常。

接着循环 `_actionSubscribers`：

```js
this._subscribers.forEach(sub => sub(mutation, this.state))
```

`_actionSubscribers` 是一个数组，循环调用里面的函数，并将 `action` `this.state` 传入。

与 `commit` 不同的是，`dispatch` 最后会返回一个 `Promise`，
`entry` 是注册 `action` 时储存 `wrappedActionHandler` 函数的数组，在注册 `action` 时会将其包装成 `promise`，所以在 `action` 中支持异步操作，这里判断 `entry` 长度，如果是多个调用 `Promise.all` 方法，单个直接取第 0 个调用。

### subscribe

订阅 `store` 的 `mutation`：

```js
subscribe (fn) {
  return genericSubscribe(fn, this._subscribers)
}
```

`subscribe` 中 调用了 `genericSubscribe` 方法，并将回调和 `this._subscribers` 传入，返回一个函数可以停止订阅。
会在每个 `mutation` 完成后调用，通常用于插件，在 `plugins` 的 `devtool.js` 和 `logger.js` 都使用了。

### genericSubscribe

```js
function genericSubscribe(fn, subs) {
  if (subs.indexOf(fn) < 0) {
    subs.push(fn)
  }
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}
```

`genericSubscribe` 接收 `fn` 函数和一个 `subs` 数组作为参数，首先判断如果在 `subs` 没有 `fn` 函数，就往 `subs` 数组 `push` `fn` ，最后 `return` 一个 `function`，这个函数会取到当前函数在 `subs` 中的下标，然后使用 `splice` 从 `subs` 中删除，也就是说调用返回的函数可以停止订阅。

### subscribeAction

订阅 `store` 的 `action`。

```js
subscribeAction (fn) {
  return genericSubscribe(fn, this._actionSubscribers)
}
```

`subscribeAction` 中 调用了 `genericSubscribe` 方法，并将回调和 `this._actionSubscribers` 传入，返回一个函数可以停止订阅。

### watch

响应式地侦听 `fn` 的返回值，当值改变时调用回调函数。

```js
watch (getter, cb, options) {
  if (process.env.NODE_ENV !== 'production') {
    assert(typeof getter === 'function', `store.watch only accepts a function.`)
  }
  return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
}
```

判断非生产环境并且 `getter` 不是一个 `function` 抛出异常，随后会 `return` 一个函数，调用返回的函数可以停止监听，`this._watcherVM` 在 `constructor` 赋值成了一个 `Vue` 实例，其实就是基于 `Vue` 实例的 `$watch` 方法。

### replaceState

替换 `store` 的根状态。

```js
replaceState (state) {
  this._withCommit(() => {
    this._vm._data.$$state = state
  })
}
```

调用 `_withCommit` 并传入回调函数，在回调函数中会用传入的 `state` 替换当前 `_vm._data.$$state`。

### registerModule

使用 `store.registerModule` 方法注册模块：

```js
registerModule (path, rawModule, options = {}) {
  if (typeof path === 'string') path = [path]

  if (process.env.NODE_ENV !== 'production') {
    assert(Array.isArray(path), `module path must be a string or an Array.`)
    assert(path.length > 0, 'cannot register the root module by using registerModule.')
  }

  this._modules.register(path, rawModule)
  installModule(this, this.state, path, this._modules.get(path), options.preserveState)
  // reset store to update getters...
  resetStoreVM(this, this.state)
}
```

`registerModule` 方法接收 `path` 路径，`rawModule` 模块，`options` 配置作为参数。

首先判断 `path` 如果为字符串，就转成字符串数组，
在非生产环境断言，`path` 必须为一个数组，`path.length` 必须大于 0。

然后调用 `this._modules.register` 进行注册模块，`installModule` 进行模块安装，`resetStoreVM` 重设 `Vue` 实例。

### unregisterModule

卸载一个动态模块：

```js
unregisterModule (path) {
  if (typeof path === 'string') path = [path]

  if (process.env.NODE_ENV !== 'production') {
    assert(Array.isArray(path), `module path must be a string or an Array.`)
  }

  this._modules.unregister(path)
  this._withCommit(() => {
    const parentState = getNestedState(this.state, path.slice(0, -1))
    Vue.delete(parentState, path[path.length - 1])
  })
  resetStore(this)
}
```

调用 `this._modules.unregister` 进行模块注销，调用 `_withCommit`，将回调函数传入。

回调函数会调用 `getNestedState` 方法取出父 `module` 的 `state`，然后调用 `Vue.delete` 删除对应子模块，`resetStore` 进行 `store` 的重置，其他部分与 `registerModule` 一致。

### resetStore

```js
function resetStore(store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}
```

接收 `store` 和 是否 `hot` 作为参数，
将 `store` 的 `_actions`、`_mutations`、`_wrappedGetters`、`_modulesNamespaceMap` 置为 `null`。

调用 `installModule` 重新安装模块，调用 `resetStoreVM` 重设 `Vue` 实例。

### hotUpdate

开发过程中热重载 `mutation`、`module`、`action` 和 `getter`:

```js
hotUpdate (newOptions) {
  this._modules.update(newOptions)
  resetStore(this, true)
}
```

接收一个新的 `newOptions`，调用 `this._modules.update` 更新模块，然后调用 `resetStore` 重置 `store`。

余下的方法基本都在上文讲述过，到此 `class Store` 结束。

## class ModuleCollection

在上面初始参数的赋值中 `this._modules` 就是 `ModuleCollection` 类的实例。

```js
this._modules = new ModuleCollection(options)
```

如果没有嵌套模块，`this._modules` 是这样一个结构。

```js
{
  'root': {
    'runtime': false,
    '_children': {},
    '_rawModule': {
      'state': {
        'count': 0
      },
      'getters': {},
      'actions': {},
      'mutations': {}
    },
    'state': {
      'count': 0
    }
  }
}
```

来看看 `ModuleCollection：`

```js
class ModuleCollection {
  constructor(rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }

  get(path) {
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  // 根据 path 处理命名空间
  getNamespace(path) {
    let module = this.root
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  update(rawRootModule) {
    update([], this.root, rawRootModule)
  }

  register(path, rawModule, runtime = true) {
    if (process.env.NODE_ENV !== 'production') {
      assertRawModule(path, rawModule)
    }

    // 默认注册 root
    // 包装了下传过来的 rawModule
    const newModule = new Module(rawModule, runtime)
    // 判断 path.length 0 说明是 root 保存到 this.root 上
    // 下次递归注册进入 else 调用 Module 类的 getChild addChild
    // 建立 module 的父子关系
    if (path.length === 0) {
      this.root = newModule
    } else {
      const parent = this.get(path.slice(0, -1))
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules
    // 有 modules 递归注册嵌套模块
    if (rawModule.modules) {
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }

  unregister(path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    if (!parent.getChild(key).runtime) return

    parent.removeChild(key)
  }
}
```

在 `ModuleCollection` 类的 `constructor` 中首先会执行类的 `register` 方法，将空数组、`rawRootModule`(也就是实例化的时候传入的 `options`)、`false` 最为最初参数传入。

`register` 方法会递归调用，实现嵌套模块的收集
首先会在非生产环境调用 `assertRawModule` 函数，对 `module` 进行一些断言判断，判断 `rawModule` 对象是否有 `getters` `mutations` `mutations` 为 `key` 值，然后根据预置的类型进行断言。

随后就是实例化 `Module` 新建一个 `newModule`，判断 `path.length`，0 说明是 `root`， 将 `newModule` 保存到 `this.root` 上，然后判断 `rawModule.modules` 是否有嵌套 `modules`。

有就调用 `forEachValue` 将 `modules`转换成数组，并且循环调用传入的回调函数，回调函数里又递归调用了 `this.register`，将 `path` 合并子模块的 `key`, 循环的子模块、`runtime` 作为参数传入。

第二次进入 `register` 会进入 `else` 判断，调用 `Module` 类的 `getChild` `addChild`, 建立 `module` 的父子关系，如果仍然嵌套模块继续递归调用 `this.register`。

`forEachValue`：

```js
// object 转成数组 循环调用 fn
export function forEachValue(obj, fn) {
  Object.keys(obj).forEach(key => fn(obj[key], key))
}
```

### assertRawModule

上面说过，`assertRawModule` 负责对 `module` 进行一些断言判断，判断 `rawModule` 对象是否有 `getters`、`mutations`、`mutations` 为 `key` 值，然后根据预置的类型进行断言。

```js
const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
}

const objectAssert = {
  assert: value =>
    typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
}

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
}

function assertRawModule(path, rawModule) {
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return

    const assertOptions = assertTypes[key]

    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      )
    })
  })
}

function makeAssertionMessage(path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`
  }
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
```

`assertRawModule` 循环 `assertTypes` 对象，循环的 `key` 为 `getters` `mutations` `actions`，判断传入模块是否有这些属性。

```js
const assertOptions = assertTypes[key]
```

接着从 `assertTypes` 取出对应属性的 `value`

循环 `rawModule[key]` 对象，如果 `key` 此时就是 `getters`，那就是遍历当前模块有所的 `getter` 函数，回调函数是一个断言函数，`assertOptions` 的 `assert` 会返回对属性类型的判断，作为 `Boolean` 传入，`makeAssertionMessage` 函数只是对断言函数判断的异常的描述。

## class Module

来看看 `Module` 类的代码:

```js
export default class Module {
  constructor(rawModule, runtime) {
    this.runtime = runtime
    // Store some children item
    this._children = Object.create(null)
    // Store the origin module object which passed by programmer
    this._rawModule = rawModule
    const rawState = rawModule.state
    // Store the origin module's state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }

  get namespaced() {
    return !!this._rawModule.namespaced
  }

  addChild(key, module) {
    this._children[key] = module
  }

  removeChild(key) {
    delete this._children[key]
  }

  getChild(key) {
    return this._children[key]
  }

  update(rawModule) {
    this._rawModule.namespaced = rawModule.namespaced
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters
    }
  }

  forEachChild(fn) {
    forEachValue(this._children, fn)
  }

  forEachGetter(fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn)
    }
  }

  forEachAction(fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn)
    }
  }

  forEachMutation(fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn)
    }
  }
}
```

`Module` 类的 `constructor` 中会将传入的 `rawModule` `runtime` 保存，申明 `this._children`，主要是存放该模块的子模块，将 `rawModule.state` 取出保存到 `this.state` 上。

`Module` 类提供了很多方法：

`namespaced` 通过双非取值返回一个 `布尔值` ，作为是否有命名空间的判断。

`addChild` 在 `ModuleCollection` 的 `register` 方法中调用，将子模块存入到父模块的 `this._children`

`removeChild` 删除子模块

`getChild` 获取子模块

`update` 在 `ModuleCollection` 的 `update` 的调用，负责整个模块的更新

后面的几个方法都是调用 `forEachValue`,将对应对应的模块，以及传入的 `fn` 传入。

### getNamespace

根据 `path` 处理命名空间：

```js
getNamespace (path) {
  let module = this.root
  return path.reduce((namespace, key) => {
    module = module.getChild(key)
    return namespace + (module.namespaced ? key + '/' : '')
  }, '')
}
```

## 辅助工具函数

在 `vue` 的入口文件默认导出辅助工具函数。

```js
import { Store, install } from './store'
import {
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers
} from './helpers'

export default {
  Store,
  install,
  version: '__VERSION__',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers
}
```

我们可以通过解构调用 `vuex` 暴露出来的辅助工具函数。

```js
import { mapState, mapMutations, mapGetters, mapActions } from 'vuex'
```

辅助工具函数在 `src/helpers.js`:

```js
export const mapState = normalizeNamespace((namespace, states) => {
  ...
  return res
})

export const mapMutations = normalizeNamespace((namespace, mutations) => {
  ...
  return res
})

export const mapGetters = normalizeNamespace((namespace, getters) => {
  ...
  return res
})

export const mapActions = normalizeNamespace((namespace, actions) => {
  ...
  return res
})

export const createNamespacedHelpers = (namespace) => ({
  ...
})
```

可以看到 `helpers.js` 向外暴露了 5 个辅助工具函数，在 `vuex` 入口文件中包装成对象后暴露出去。

### mapState

`mapState` 辅助函数帮助我们生成计算属性。

来看一下具体实现：

```js
/**
 * Reduce the code which written in Vue.js for getting the state.
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} states # Object's item can be a function which accept state and getters for param, you can do something for state and getters in it.
 * @param {Object}
 */
export const mapState = normalizeNamespace((namespace, states) => {
  const res = {}
  normalizeMap(states).forEach(({ key, val }) => {
    res[key] = function mappedState() {
      let state = this.$store.state
      let getters = this.$store.getters
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapState', namespace)
        if (!module) {
          return
        }
        state = module.context.state
        getters = module.context.getters
      }
      return typeof val === 'function'
        ? val.call(this, state, getters)
        : state[val]
    }
    // mark vuex getter for devtools
    res[key].vuex = true
  })
  return res
})
```

`mapState` 函数是经过 `normalizeNamespace` 函数处理后返回的函数。

### normalizeNamespace

我们来看看 `normalizeNamespace` 函数：

```js
/**
 * Return a function expect two param contains namespace and map. it will normalize the namespace and then the param's function will handle the new namespace and the map.
 * @param {Function} fn
 * @return {Function}
 */
function normalizeNamespace(fn) {
  return (namespace, map) => {
    if (typeof namespace !== 'string') {
      map = namespace
      namespace = ''
    } else if (namespace.charAt(namespace.length - 1) !== '/') {
      namespace += '/'
    }
    return fn(namespace, map)
  }
}
```

`normalizeNamespace` ，接收一个 `fn` 作为参数，最后返回一个函数。

```js
;(namespace, map) => {
  if (typeof namespace !== 'string') {
    map = namespace
    namespace = ''
  } else if (namespace.charAt(namespace.length - 1) !== '/') {
    namespace += '/'
  }
  return fn(namespace, map)
}
```

此时 `mapState` 就等于这个函数，它接收 `namespace` 、`map` 作为参数，`namespace` 就是命名空间，`map` 就是传过来的 `state`。

判断 `namespace` 不是一个字符串，因为 `mapState` 第一个参数是可选的，如果不是字符串就说明没有命名空间，第一个参数就是传入的 `state`，将 `namespace` 赋值给 `map`，然后将 `namespace` 置为空字符串。进入 `else if` 判断 `namespace` 最后一个字符串是否是 `'/'`，没有就拼上 `'/'` 。

当调用 `mapState` 的时候，就会返回 `fn(namespace, map)` 函数的运行后的结果，就是一个 `res` 对象。

`normalizeNamespace` 是一个高阶函数实现，高阶函数是接收一个或者多个函数作为参数，并返回一个新函数的函数。

我们来看一下 `mapState` 中的 `fn` 具体实现。

首先申明一个 `res` 对象，循环赋值后返回，接着调用 `normalizeMap` 函数, `normalizeMap` 接收一个对象或者数组，转化成一个数组形式，数组元素是包含 `key` 和 `value` 的对象。

### normalizeMap

```js
/**
 * Normalize the map
 * normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
 * normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
 * @param {Array|Object} map
 * @return {Object}
 */
function normalizeMap(map) {
  return Array.isArray(map)
    ? map.map(key => ({ key, val: key }))
    : Object.keys(map).map(key => ({ key, val: map[key] }))
}
```

经过 `normalizeMap` 函数处理后，会转化成一个数组， `[{key: key, val: fn}]` 的格式，调用 `forEach` 循环处理，在 `forEach` 的回调函数中。

使用解构取出 `key` 和 `value`，每一次循环就以 `key` 为键，`mappedState` 函数为 `value` 存入 `res` 对象，
在 `mappedState` 函数中，声明 `state` 和 `getters` 变量保存 `this.$store.state` 和 `this.$store.getters`。

接着判断传入的 `namespace`，如果有 `namespace` 就调用 `getModuleByNamespace` 函数搜索对应模块，如果没有搜索到就 `return`，有对应模块的话将对应模块的 `state` `getters` 赋值给声明的 `state` 和 `getters` 变量。

`mappedState` 最后判断 `val` 是否是 `function`，是就调用 `call` 将 `val` 的 `this` 绑定到 `Vue` 实例，并将 `state` `getters` 作为参数传递，执行后返回，不是 `function` 根据 `key` 返回对应的 `state`。

### getModuleByNamespace

`getModuleByNamespace` 函数主要用来搜索具有命名空间的模块。

```js
/**
 * Search a special module from store by namespace. if module not exist, print error message.
 * @param {Object} store
 * @param {String} helper
 * @param {String} namespace
 * @return {Object}
 */
function getModuleByNamespace(store, helper, namespace) {
  const module = store._modulesNamespaceMap[namespace]
  if (process.env.NODE_ENV !== 'production' && !module) {
    console.error(
      `[vuex] module namespace not found in ${helper}(): ${namespace}`
    )
  }
  return module
}
```

函数开始申明 `module` 变量，然后根据 `namespace` 从 `store._modulesNamespaceMap` 取出对应模块，
`_modulesNamespaceMap` 这个变量是在 `Store` 类中，调用 `installModule` 时候保存所以有命名空间模块的变量。
判断非生产环境并且没有对应模块，抛出异常，最后将 `module` 变量返回。

`forEach` 最后还有一段：

```js
// mark vuex getter for devtools
res[key].vuex = true
```

应该是 `devtools` 需要这个属性判断 `value` 是否属于 `vuex`。

完成 `forEach` 循环后会将处理后的 `res` 对象返回。

### mapMutations

`mapMutations` 辅助函数将组件中的 `methods` 映射为 `store.commit` 调用。

来看一下具体实现：

```js
/**
 * Reduce the code which written in Vue.js for committing the mutation
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} mutations # Object's item can be a function which accept `commit` function as the first param, it can accept anthor params. You can commit mutation and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
export const mapMutations = normalizeNamespace((namespace, mutations) => {
  const res = {}
  normalizeMap(mutations).forEach(({ key, val }) => {
    res[key] = function mappedMutation(...args) {
      // Get the commit method from store
      let commit = this.$store.commit
      if (namespace) {
        const module = getModuleByNamespace(
          this.$store,
          'mapMutations',
          namespace
        )
        if (!module) {
          return
        }
        commit = module.context.commit
      }
      return typeof val === 'function'
        ? val.apply(this, [commit].concat(args))
        : commit.apply(this.$store, [val].concat(args))
    }
  })
  return res
})
```

`mapMutations` 处理过程与 `mapState` 相似，我看来看看传入 `normalizeNamespace` 的回调函数。

首先也是申明 `res` 空对象，经过 `normalizeMap` 函数处理后的 `mutations` 调用 `forEach` 循环处理，在 `forEach` 的回调函数中， 使用解构取出 `key` 和 `value`，每一次循环就以 `key` 为键、`mappedMutation` 函数为 `value` 存入 `res` 对象， 在 `mappedMutation` 函数中，声明 `commit` 变量保存 `this.$store.commit` 。

判断传入的 `namespace`，如果有 `namespace` 就调用 `getModuleByNamespace` 函数搜索对应模块，如果没有搜索到就 `return`，有对应模块的话对应模块的将 `commit` 赋值给声明的 `commit` 变量。

`mappedMutation` 最后判断 `val` 是否是 `function`，是就调用 `apply` 将 `val` 的 `this` 绑定到 `Vue` 实例，并将 `commit` 和 `args` 合并成一个数组作为参数传递，，`val` 不是 `function` 就将 `commit` 调用 `apply` 改变了 `this` 指向，将 `val` 和 `args` 合并成一个数组作为参数传递，执行后返回。

最后将 `res` 对象返回。

### mapGetters

`mapGetters` 辅助函数将 `store` 中的 `getter` 映射到局部计算属性。

来看一下具体实现：

```js
/**
 * Reduce the code which written in Vue.js for getting the getters
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} getters
 * @return {Object}
 */
export const mapGetters = normalizeNamespace((namespace, getters) => {
  const res = {}
  normalizeMap(getters).forEach(({ key, val }) => {
    // thie namespace has been mutate by normalizeNamespace
    val = namespace + val
    res[key] = function mappedGetter() {
      if (
        namespace &&
        !getModuleByNamespace(this.$store, 'mapGetters', namespace)
      ) {
        return
      }
      if (
        process.env.NODE_ENV !== 'production' &&
        !(val in this.$store.getters)
      ) {
        console.error(`[vuex] unknown getter: ${val}`)
        return
      }
      return this.$store.getters[val]
    }
    // mark vuex getter for devtools
    res[key].vuex = true
  })
  return res
})
```

我看来看看传入 `normalizeNamespace` 的回调函数。

首先也是申明 `res` 空对象，经过 `normalizeMap` 函数处理后的 `getters` 调用 `forEach` 循环处理，在 `forEach` 的回调函数中， 使用解构取出 `key` 和 `value`，每一次循环就以 `key` 为键、`mappedGetter` 函数为 `value` 存入 `res` 对象，这里会将 `val` 赋值成 `namespace + val`，如果有命名空间，此时的 `val` 应该是类似这样的: `cart/cartProducts`。

在 `mappedGetter` 函数中，首先判断如果有 `namespace` 并且调用 `getModuleByNamespace` 函数没有匹配到对应模块就直接 `return`。

然后判断在非生产环境并且 `this.$store.getters` 没有对应的 `val` 就抛出异常并返回。接下来就是有对应模块的情况，直接返回 `this.$store.getters` 对应的 `getter`。

最后将 `res` 对象返回。

### mapActions

`mapActions` 辅助函数将组件的 `methods` 映射为 `store.dispatch` 调用。

来看一下具体实现：

```js
/**
 * Reduce the code which written in Vue.js for dispatch the action
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} actions # Object's item can be a function which accept `dispatch` function as the first param, it can accept anthor params. You can dispatch action and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
export const mapActions = normalizeNamespace((namespace, actions) => {
  const res = {}
  normalizeMap(actions).forEach(({ key, val }) => {
    res[key] = function mappedAction(...args) {
      // get dispatch function from store
      let dispatch = this.$store.dispatch
      if (namespace) {
        const module = getModuleByNamespace(
          this.$store,
          'mapActions',
          namespace
        )
        if (!module) {
          return
        }
        dispatch = module.context.dispatch
      }
      return typeof val === 'function'
        ? val.apply(this, [dispatch].concat(args))
        : dispatch.apply(this.$store, [val].concat(args))
    }
  })
  return res
})
```

`mapActions` 处理过程与 `mapMutations` 函数一模一样，就不在赘述。

### createNamespacedHelpers

`createNamespacedHelpers` 创建基于某个命名空间辅助函数。

来看一下具体实现：

```js
/**
 * Rebinding namespace param for mapXXX function in special scoped, and return them by simple object
 * @param {String} namespace
 * @return {Object}
 */
export const createNamespacedHelpers = namespace => ({
  mapState: mapState.bind(null, namespace),
  mapGetters: mapGetters.bind(null, namespace),
  mapMutations: mapMutations.bind(null, namespace),
  mapActions: mapActions.bind(null, namespace)
})
```

`createNamespacedHelpers` 函数接受一个字符串作为参数，返回一个包含 `mapState` 、`mapGetters` 、`mapActions` 和 `mapMutations` 的对象。

以 `mapState` 为例，调用 `mapState` 函数的 `bind` 方法，将 `null` 作为第一个参数传入，不会改变 `this` 指向，`namespace` 作为第二个参数。

```js
import { createNamespacedHelpers } from 'vuex'

const { mapState, mapActions } = createNamespacedHelpers('some/nested/module')

export default {
  computed: {
    // 在 `some/nested/module` 中查找
    ...mapState({
      a: state => state.a,
      b: state => state.b
    })
  },
  methods: {
    // 在 `some/nested/module` 中查找
    ...mapActions(['foo', 'bar'])
  }
}
```

此时的 `mapState` 函数就是经过 `bind` 处理过的，会将 `namespace` 作为第一个参数传入。

相当于下面这样：

```js
...mapState('some/nested/module', {
  a: state => state.a,
  b: state => state.b
})
```

简化了重复写入命名空间。

到此 `helpers.js` 结束。

## 工具函数

工具函数在 `src/util.js`。

### find

```js
/**
 * Get the first item that pass the test
 * by second argument function
 *
 * @param {Array} list
 * @param {Function} f
 * @return {*}
 */
export function find(list, f) {
  return list.filter(f)[0]
}
```

`find` 接收 `list` 数组，`f` 回调函数，调用 `filter` 返回匹配 `f` 函数的第一个。

### deepCopy

`deepCopy` 函数：

```js
/**
 * Deep copy the given object considering circular structure.
 * This function caches all nested objects and its copies.
 * If it detects circular structure, use cached copy to avoid infinite loop.
 *
 * @param {*} obj
 * @param {Array<Object>} cache
 * @return {*}
 */
export function deepCopy(obj, cache = []) {
  // just return if obj is immutable value
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // if obj is hit, it is in circular structure
  const hit = find(cache, c => c.original === obj)
  if (hit) {
    return hit.copy
  }

  const copy = Array.isArray(obj) ? [] : {}
  // put the copy into cache at first
  // because we want to refer it in recursive deepCopy
  cache.push({
    original: obj,
    copy
  })

  Object.keys(obj).forEach(key => {
    copy[key] = deepCopy(obj[key], cache)
  })

  return copy
}
```

`deepCopy` 接收一个 `obj` 和 `cache` 数组作为参数，初次调用时 `cache` 为空数组。

首先判断 `obj` 全等于 `null` 或者 `obj` 的类型不等于 `object` 就返回 `obj`，接下来调用 `find`，将 `cache` 和 回调传入，会使用 `filter` 去过滤匹配的对象，`c.original` 全等于当前循环的 `obj` 对象 ，这里判断的是一个引用地址，`find` 函数会返回匹配 `f` 函数的第一个。

如果有 `hit` 就说明是环形结构，直接返回 `hit.copy`。

```js
const obj = {
  a: 1
}
obj.b = obj
```

所谓环形环形结构，就是对象之间相互引用。

接下来申明 `copy` 变量，如果 `obj` 是数组 `copy` 等于空数组，否则就是空对象，

保存 `cache`:

```js
cache.push({
  original: obj,
  copy
})
```

以 `original` 为 `key`, `obj` 为 `value`，将已经上面申明的 `copy` 变量包装成对象 `push` 到 `cache` 数组中。

循环 `obj keys`，递归调用 `deepCopy` 将 `obj[key]` 和缓存的 `cache` 作为参数传入。

最后将深拷贝的 `copy` 对象返回。

### forEachValue

```js
/**
 * forEach for object
 */
export function forEachValue(obj, fn) {
  Object.keys(obj).forEach(key => fn(obj[key], key))
}
```

`forEachValue` 接收 `obj` 和 `fn` 作为参数，
使用 `Object.keys()` 将 `obj` 转化成数组，使用 `forEach` 循环调用，
在 `forEach` 的回调函数中，会将 `obj[key]` `key` 作为参数传入 `fn`，循环调用 `fn` 函数。

### isObject

```js
export function isObject(obj) {
  return obj !== null && typeof obj === 'object'
}
```

`isObject` 接收 `obj` 作为参数，返回 `obj` 不等于 `null` 并且 `obj` 的类型是 `object`，判断传入的对象是否是纯对象，返回 `Boolean`。

### isPromise

```js
export function isPromise(val) {
  return val && typeof val.then === 'function'
}
```

`isPromise` 接收 `val` 作为参数，返回有 `val` 并且 `val` 的 `then` 是一个 `function`，只是简单判断一个有没有 `then` 方法。

### assert

```js
export function assert(condition, msg) {
  if (!condition) throw new Error(`[vuex] ${msg}`)
}
```

`assert` 接收 `condition` 和 `msg` 作为参数，如果 `condition` 取非为真，就调用 `throw new Error` 抛出异常。

## 插件

### devtool

```js
const devtoolHook =
  typeof window !== 'undefined' && window.__VUE_DEVTOOLS_GLOBAL_HOOK__

export default function devtoolPlugin(store) {
  if (!devtoolHook) return

  store._devtoolHook = devtoolHook

  devtoolHook.emit('vuex:init', store)

  devtoolHook.on('vuex:travel-to-state', targetState => {
    store.replaceState(targetState)
  })

  store.subscribe((mutation, state) => {
    devtoolHook.emit('vuex:mutation', mutation, state)
  })
}
```

根据 `window` 上的 `__VUE_DEVTOOLS_GLOBAL_HOOK_` 变量判断当前浏览器是否安装了 `vueTools`，
接着来看 `devtoolPlugin` 函数，`devtoolPlugin` 函数使用 `export default` 默认导出，
在 `Store` 实例的 `constructor` 中调用。

进入 `devtoolPlugin` 函数内部，接收 `store` 参数，`store` 调用时候传入的 `this`，也就是`Store` 实例，
判断没有 `devtoolHook` 直接 `retrun`，将 `devtoolHook` 赋值给 `store._devtoolHook`，会在 `Store` 实例的 `registerAction` 中用到。

向 `vueTools` `emit` `vuex:init` 事件，并将 `store` 传入，`devtoolHook` 监听到会根据 `store` 初始化 `vuex`。

`devtoolHook` 调用 `on` 方法监听 `vuex:travel-to-state`，监听到就调用回调函数，回调函数里会调用 `Store` 类的 `replaceState` 方法。

```js
replaceState (state) {
  this._withCommit(() => {
    this._vm._data.$$state = state
  })
}
```

`replaceState` 替换当前 `_vm._data.$$state`。

最后调用 `Store` 类的 `subscribe` 订阅，每一次 `mutation` 改变 `state`，都会调用 `devtoolHook` 的 `emit` 方法通知 `devtool` 改变 `mutation` `state`。

`devtoolHook` 原理 ？
占坑： 猜测是一个 `Vue Bus`。

### createLogger

`vuex` 有个内置的插件 `createLogger`，位于 `src/plugins/logger.js`:

```js
export default function createLogger({
  collapsed = true,
  filter = (mutation, stateBefore, stateAfter) => true,
  transformer = state => state,
  mutationTransformer = mut => mut,
  logger = console
} = {}) {
  return store => {
    let prevState = deepCopy(store.state)

    store.subscribe((mutation, state) => {
      if (typeof logger === 'undefined') {
        return
      }
      const nextState = deepCopy(state)

      if (filter(mutation, prevState, nextState)) {
        const time = new Date()
        const formattedTime = ` @ ${pad(time.getHours(), 2)}:${pad(
          time.getMinutes(),
          2
        )}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`
        const formattedMutation = mutationTransformer(mutation)
        const message = `mutation ${mutation.type}${formattedTime}`
        const startMessage = collapsed ? logger.groupCollapsed : logger.group

        // render
        try {
          startMessage.call(logger, message)
        } catch (e) {
          console.log(message)
        }

        logger.log(
          '%c prev state',
          'color: #9E9E9E; font-weight: bold',
          transformer(prevState)
        )
        logger.log(
          '%c mutation',
          'color: #03A9F4; font-weight: bold',
          formattedMutation
        )
        logger.log(
          '%c next state',
          'color: #4CAF50; font-weight: bold',
          transformer(nextState)
        )

        try {
          logger.groupEnd()
        } catch (e) {
          logger.log('—— log end ——')
        }
      }

      prevState = nextState
    })
  }
}
```

`createLogger` 接收一个 `options` 对象，默认为 `{}` :

- collapsed: 默认为 true, 自动展开记录的 mutation
- filter: 默认为 true，过滤 mutation 记录
- transformer: 在开始记录之前转换状态
- mutationTransformer: 格式化 mutation 记录
- logger: 默认为 console，自定义 console

`createLogger` 返回了一个函数，首先申明 `prevState` 变量，赋值为深拷贝后的 `store.state` 对象，
调用 `store` 的 `subscribe` 方法添加事件订阅，传入一个回调函数，在回调函数中接收 `mutation` `state` 两个参数，判断 `logger` 的类型为 `undefined` 就 `return`。

申明 `nextState` 变量，赋值为深拷贝后的回调函数中传入的 `state` 对象，
接着判断 `filter` 函数，这个默认为 `true`，进入 `if` 循环后会申明 `time` 变量保存当前事件戳，申明 `formattedTime` 变量保存格式化后的时间， 申明 `formattedMutation` 保存处理后的经过 `mutationTransformer`处理后的 `mutation`，申明 `message` 保存默认信息，申明 `startMessage` 变量，根据传入的 `collapsed` 赋值为不同的打印方法。

```js
console.groupCollapsed: 设置折叠的分组信息
console.group:          设置不折叠的分组信息
console.groupEnd:       结束当前的分组
```

接着使用 `call` 将 `startMessage` 的 `this` 绑定到 `logger` 上，并且传入 `message` 默认参数。

```js
// render
try {
  startMessage.call(logger, message)
} catch (e) {
  console.log(message)
}
```

接着就是调用 `logger.log` 打印，随后调用 `groupEnd` 结束当前的分组。

最后将 `prevState` 赋值为 `nextState`，保持状态更新。

两个处理时间的函数：

```js
// 调用数组的 join，返回指定数量的字符串
function repeat(str, times) {
  return new Array(times + 1).join(str)
}

// 保持总长度为 maxLength，在数字前补 0
function pad(num, maxLength) {
  return repeat('0', maxLength - num.toString().length) + num
}
```

## 问题总结

### global eventBus 有何缺陷

`eventBus` 比较适合简单应用，但是随着需求增加，组件之间通信增多，`eventBus` 就显得不够直观，不方便我们管理，而且随着组件复用的增多，多个组件通信，又相互通信，就容易导致混乱。

### \$store 如何注入到所有子组件

`$store` 是在 vuex install 初始化的时候赋值的，来看一下代码：

```js
/**
 * Vuex init hook, injected into each instances init hooks list.
 */

function vuexInit() {
  const options = this.$options
  if (options.store) {
    this.$store =
      typeof options.store === 'function' ? options.store() : options.store
  } else if (options.parent && options.parent.$store) {
    this.$store = options.parent.$store
  }
}
```

在 `vuexInit` 方法中，首先判断如果有 `this.$options.store` 说明是 `root` 节点，判断 `store` 如果是 `function` 就将函数执行后的返回赋值给 `this.$store` ，否则将 `options.store` 直接赋值给 `this.$store`。

不是 `root` 节点就从父组件中获取 `$store`，这样就保证只有一个全局的 `$store`。

### mapState 实现

`mapState` 请看 `src/helpers.js` 的 `mapState` 部分。

### mapGetter 如何映射

`mapGetter` 方法最后会返回一个对象，这个对象的每一个 `key` 值是 `mappedGetter` 方法，`mappedGetter` 会返回 `this.$store.getters[key]`。

```js
mapGetters({
  // 把 `this.doneCount` 映射为 `this.$store.getters.doneTodosCount`
  doneCount: 'doneTodosCount'
})
```

### Mutation 同步 && Action 异步

在注册 `action` 时储会将 `action` 的回调包装成 `promise`，通过 `dispatch` 方法触发 `action` 的时候，最后 `return` 的是个 `Promise` 对象，所以 `action` 支持异步。

注册 `mutation` 和通过 `commit` 方法触发 `mutation` 的时候，都只是一个同步的代码，仍然是同步代码。

### dispatch 方法实现

`dispatch` 请看 `src/store.js` 的 `dispatch` 部分。

### module 分割实现 && 局部状态 namespaced

实例化 `ModuleCollection`

请看 `class ModuleCollection`。

### 如何调用 vue-devtools

在 `devtoolPlugin` 方法中，取出挂在 `window` 对象的 `__VUE_DEVTOOLS_GLOBAL_HOOK__` 保存到 `devtoolHook`，通过 `emit` `vuex:init` 初始化 `store`：

```js
devtoolHook.emit('vuex:init', store)
```

```js
devtoolHook.on('vuex:travel-to-state', targetState => {
  store.replaceState(targetState)
})
```

```js
store.subscribe((mutation, state) => {
  devtoolHook.emit('vuex:mutation', mutation, state)
})
```

```js
export default function devtoolPlugin(store) {
  if (!devtoolHook) return

  store._devtoolHook = devtoolHook

  // 向 vueTools emit 事件 并传入当前的 store
  // devtoolHook 监听到会根据 store 初始化 vuex
  devtoolHook.emit('vuex:init', store)

  // devtoolHook 监听 vuex:travel-to-state，调用回调函数
  devtoolHook.on('vuex:travel-to-state', targetState => {
    store.replaceState(targetState)
  })

  store.subscribe((mutation, state) => {
    devtoolHook.emit('vuex:mutation', mutation, state)
  })
}
```

### 内置 logger 插件实现

请看插件 `devtool` 部分。

### hotUpdate

使用 `webpack` 的 `Hot Module Replacement API` 实现热重载。

```js
if (module.hot) {
  module.hot.accept(['./getters', './actions', './mutations'], () => {
    store.hotUpdate({
      getters: require('./getters'),
      actions: require('./actions'),
      mutations: require('./mutations')
    })
  })
}
```

### 时间穿梭功能实现

当我们调用 `devtoolHook` 方法的时候，会调用 `devtoolHook` 的 `on` 方法监听 `vuex:travel-to-state` 事件。

在 `vue-devtools` 的源码的 `src/bridge.js` 中：

```js
import { EventEmitter } from 'events'
```

我们看到事件监听是通过 `Node` 的 `EventEmitter` 监听的。

```js
devtoolHook.on('vuex:travel-to-state', targetState => {
  store.replaceState(targetState)
})
```

在回调函数中接收 `targetState` 参数，调用 `Store` 的 `replaceState` 方法去修改 `this._vm._data.$$state`，当我们点击 `devtoolHook` 的某一条 `mutation` 历史记录，就能穿梭到历史记录。

但是这个历史记录又是怎么出现的呢？是通过调用 `store.subscribe` 方法：

```js
store.subscribe((mutation, state) => {
  devtoolHook.emit('vuex:mutation', mutation, state)
})
```

每当调用 `commit` 方法的时候，都会调用

```js
this._subscribers.forEach(sub => sub(mutation, this.state))
```

循环调用 `_subscribers` 中的回调函数，回调函数会调用 `devtoolHook.emit` 方法，发送 `vuex:mutation`，说明改变了 `mutation`，并把 `mutation` 和 `state` 作为参数传入，`devtoolHook` 就会储存 `mutation` 的历史记录了。

`vuex` 相关在 `vue-devtools/src/backend/vuex.js`:

```js
// application -> devtool
hook.on('vuex:mutation', ({ type, payload }) => {
  if (!SharedData.recordVuex) return

  const index = mutations.length

  mutations.push({
    type,
    payload,
    index,
    handlers: store._mutations[type]
  })

  bridge.send('vuex:mutation', {
    mutation: {
      type: type,
      payload: stringify(payload),
      index
    },
    timestamp: Date.now()
  })
})
```

看到是通过一个 `mutations` 数组模拟这个历史记录，每次监听到 `vuex:mutation` 事件就是 `push` `mutation` 相关。
