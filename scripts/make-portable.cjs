// Makes the portable copy of a release: a zip that is unpacked anywhere and run from there.
//
//   npm run dist                          (or: npx electron-builder ... --win --dir)
//   node scripts/make-portable.cjs
//
// It takes the unpacked program that electron-builder leaves in release/<version>/win-unpacked and
// adds one file, portable.txt. That file is what makes the copy portable (the program then keeps
// everything in the folder `data` beside it: src/main/user-data-path.ts), and it is the read-me.
// The zip holds no data folder, so that a new version can be unpacked over an old one. The result
// is release/<version>/Marubako-<version>-portable.zip, holding one folder, Marubako.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const FOLDER = 'Marubako'
// PORTABLE_MARKER_FILENAME and PORTABLE_DATA_DIRNAME of src/main/user-data-path.ts.
const MARKER_FILENAME = 'portable.txt'
const DATA_DIRNAME = 'data'

const README = [
  'Marubako (portable)',
  '',
  'Keep this file where it is: it is what makes this copy portable. Without it',
  'Marubako keeps its data in your user profile, like an installed copy.',
  '',
  'Run Marubako.exe. Everything Marubako keeps is in the folder "data" beside it,',
  'which is made on the first start. Nothing is installed. The one thing kept in',
  'Windows itself is "Start with Windows", if you turn it on: turn it off again',
  'before you move or delete this folder.',
  '',
  'This copy does not update itself; it tells you when there is a newer version.',
  'For a new version: quit Marubako, unpack the new zip to the same place and let',
  'it replace the files. The zip has no "data" folder in it, so yours stays as it',
  'is.',
  '',
  'Passwords are encrypted for your Windows account on this PC. On another PC the',
  'items are all there, and the passwords have to be typed again there. The folder',
  'keeps the key of every PC it has run on: what was saved on one of them can be',
  'read again when the folder is back on it.',
  '',
  '----------------------------------------------------------------------',
  '',
  'Marubako（免安装的绿色版）',
  '',
  '请把这个文件留在原处：有它，这份程序才是绿色版。没有它，',
  'Marubako 会像安装版一样把数据放进用户目录。',
  '',
  '运行 Marubako.exe。Marubako 保存的所有东西都在旁边的 data 文件夹里，',
  '第一次启动时会自动建好。不需要安装。唯一会写进 Windows 本身的是',
  '「开机自动启动」（打开了才会有）：移动或删除这个文件夹之前，请先把它关掉。',
  '',
  '绿色版不会自动更新，只会在有新版本时提示你。换新版本时：先退出 Marubako，',
  '把新的压缩包解压到同一个位置，选择替换文件。压缩包里没有 data 文件夹，',
  '你的数据原样保留。',
  '',
  '密码是按这台电脑上的 Windows 账号加密的。拷到别的电脑，',
  '条目都在，密码需要重新填写。文件夹会留着每台用过的电脑各自的密钥：',
  '回到哪台电脑，在那台电脑上保存的密码就照常能读。',
  '',
  '----------------------------------------------------------------------',
  '',
  'Marubako（インストール不要のポータブル版）',
  '',
  'このファイルはこのまま置いておいてください。これがあることで、',
  'ポータブル版として動作します。ない場合は、インストール版と同じく',
  'ユーザープロファイルにデータを保存します。',
  '',
  'Marubako.exe を実行してください。Marubako が保存するものはすべて、',
  '隣の data フォルダに入ります（最初の起動時に作られます）。',
  'インストールは不要です。Windows 側に残るのは「Windows と同時に起動」を',
  'オンにした場合の設定だけです。このフォルダを移動または削除する前に、',
  'オフに戻してください。',
  '',
  'ポータブル版は自動更新されません。新しいバージョンがあるときに知らせる',
  'だけです。新しいバージョンにするときは、Marubako を終了し、新しい zip を',
  '同じ場所に展開してファイルを置き換えてください。zip に data フォルダは',
  '入っていないので、データはそのまま残ります。',
  '',
  'パスワードはこの PC の Windows アカウント用に暗号化されます。別の PC では',
  '項目はそのまま残り、パスワードは入力し直す必要があります。',
  'フォルダは使った PC ごとの鍵を残すので、その PC に戻せば、',
  'そこで保存したパスワードはこれまでどおり読めます。',
  '',
].join('\r\n')

/**
 * The tar of Windows (bsdtar) writes zip files. The tar of Git for Windows, which often comes first
 * in PATH, does not: so this one is named in full.
 */
function systemTar() {
  return path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'tar.exe'
  )
}

/**
 * Writes `outFile` from the unpacked program in `unpackedDir`. `workDir` is where the copy is put
 * together; what is put there is removed again.
 */
function makePortable({ unpackedDir, outFile, workDir }) {
  if (!fs.existsSync(path.join(unpackedDir, 'Marubako.exe'))) {
    throw new Error(
      `No unpacked program in ${unpackedDir}: run "npm run dist" first.`
    )
  }

  const staging = path.join(workDir, FOLDER)
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(workDir, { recursive: true })
  try {
    fs.cpSync(unpackedDir, staging, { recursive: true })
    // With a byte order mark, so that Notepad shows the Chinese and the Japanese part on any PC.
    fs.writeFileSync(path.join(staging, MARKER_FILENAME), `\ufeff${README}`)
    fs.rmSync(outFile, { force: true })
    execFileSync(
      systemTar(),
      ['-a', '-c', '-f', outFile, '-C', workDir, FOLDER],
      { stdio: 'inherit' }
    )
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
  return outFile
}

function main() {
  const root = path.resolve(__dirname, '..')
  const { version } = require('../package.json')
  const releaseDir = path.join(root, 'release', version)
  const outFile = makePortable({
    unpackedDir: path.join(releaseDir, 'win-unpacked'),
    outFile: path.join(releaseDir, `Marubako-${version}-portable.zip`),
    workDir: path.join(releaseDir, 'portable'),
  })
  fs.rmSync(path.join(releaseDir, 'portable'), { recursive: true, force: true })
  const megabytes = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1)
  console.log(
    `${path.relative(root, outFile)}: ${megabytes} MB, portable by "${MARKER_FILENAME}"`
  )
}

module.exports = {
  DATA_DIRNAME,
  FOLDER,
  MARKER_FILENAME,
  makePortable,
  systemTar,
}

if (require.main === module) main()
