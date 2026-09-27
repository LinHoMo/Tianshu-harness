import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// v3.26.0 发布时 GitHub Release 与 latest.json 都升到 3.26.0，`package.json` 留在
// 3.25.1；上一个 tag 同样差一格（v3.25.1 的 package.json 是 3.25.0）。所以这不是漏 bump
// 一次，是发布流程里没有任何东西把这两个版本源钉在一起。
//
// 后果顺着代码可数三条：
//   1. `rivet --version`（cli/version.ts 读 package.json 的 version）自报旧版本。
//   2. checkForUpdate 拿它比 npm latest → 源码检出装好后「Update available」永远消不掉：
//      /update 对 source 型安装执行的是 `git pull && npm install && npm run build`
//      （tui/updater.ts），而 checkout 出来的 tag 里 package.json 还是旧的，横幅自洽地
//      把自己喂回去。
//   3. 最隐蔽的一条：build-runtime-bundle.sh 从 package.json 派生 version.txt，发布的
//      runtime bundle 布局里没有根 package.json（只有 version.txt）——于是 v3.26.0 桌面端
//      内嵌的那个 rivet 运行时自称 3.25.1。修好 package.json 这一条自动跟着好。

interface PackageJson { version?: unknown; name?: unknown }
interface LatestJson {
  version?: unknown
  platforms?: Record<string, { url?: unknown }>
}

// 公开仓的同步树不带 desktop/（见 build-entry-completeness.test.ts 同款处理）：
// 桌面端版本号在 dev 主仓才判得动，缺目录时跳过而不是假绿成"通过"。
const TAURI_CONF = new URL('../../desktop/src-tauri/tauri.conf.json', import.meta.url)

const pkg = JSON.parse(read('../../package.json')) as PackageJson
const latest = JSON.parse(read('../../latest.json')) as LatestJson

describe('release version consistency', () => {
  it('package.json carries the version that was actually released', () => {
    assert.equal(typeof pkg.version, 'string', 'package.json 没有 version 字段')
    assert.equal(typeof latest.version, 'string', 'latest.json 没有 version 字段')
    // 反向证据也查：latest.json 的下载链指向哪个 tag，本仓就该停在哪个版本。
    assert.equal(
      pkg.version,
      latest.version,
      `package.json ${pkg.version} != latest.json ${latest.version}`
      + ' —— 发布只动了 latest.json/Release，package.json 没跟上',
    )
  })

  it('package-lock stays in lockstep with package.json', () => {
    const lock = JSON.parse(read('../../package-lock.json')) as {
      packages?: Record<string, PackageJson>
    }
    const root = lock.packages?.['']
    assert.ok(root, 'package-lock.json 缺 packages[""] 根条目')
    assert.equal(
      root.version,
      pkg.version,
      `package-lock 根版本 ${root.version} != package.json ${pkg.version} —— 手改 version 未跑 npm install`,
    )
  })

  it('every latest.json download points at the released tag', () => {
    const version = latest.version
    assert.equal(typeof version, 'string', 'latest.json 没有 version 字段')
    const platforms = latest.platforms ?? {}
    const names = Object.keys(platforms)
    assert.ok(names.length > 0, 'latest.json 没有任何 platforms 条目')
    for (const name of names) {
      const url = platforms[name]?.url
      assert.ok(typeof url === 'string', `platforms.${name} 缺 url`)
      assert.ok(
        url.includes(`/releases/download/v${version}/`),
        `platforms.${name} 的下载链不在 v${version} 下：${url}`,
      )
    }
  })

  // 公开仓的同步树不带 desktop/（见 build-entry-completeness.test.ts 同款处理）：
  // 桌面端版本号在 dev 主仓才判得动，缺目录时跳过而不是假绿成"通过"。
  it('desktop tauri version matches package.json', { skip: !existsSync(TAURI_CONF) }, () => {
    const conf = JSON.parse(readFileSync(TAURI_CONF, 'utf-8')) as { productVersion?: unknown }
    assert.equal(
      conf.productVersion,
      pkg.version,
      `tauri.conf.json productVersion ${String(conf.productVersion)} != package.json ${String(pkg.version)}`,
    )
  })
})
