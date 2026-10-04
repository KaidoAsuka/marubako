// The made-up data the README demos are recorded with: the desk of a developer who works on one
// product across several environments. Nothing here is real: the hosts are example.com names and
// the passwords are placeholders that are never shown.

const TEXT = {
  zh: {
    design: '设计文档',
    basicDesign: '基本设计书',
    detailDesign: '详细设计书',
    apiSpec: '接口定义',
    project: '项目',
    frontend: '前端工程',
    backend: '后端工程',
    testEvidence: '测试证据',
    dev: '开发环境',
    test: '测试环境',
    staging: '预发环境',
    docs: '在线文档',
    admin: '管理后台',
    userSite: '用户端',
    apiDocs: 'API 文档',
    logs: '日志平台',
    wiki: '团队 Wiki',
    tickets: '需求与缺陷',
    pipeline: '构建流水线',
    tools: '开发工具',
    cmdPrompt: '命令提示符',
    testAccounts: '测试环境账号',
    servers: '服务器',
    adminAccount: '管理后台管理员',
    testUser: '测试用户 A',
    devApp: '开发应用服务器',
    testDb: '测试数据库',
    stagingApp: '预发应用服务器',
    accountNote: '只用于测试环境',
    daily: '常用命令',
    tailLogs: '查看后端日志',
    tailLogsDesc: '测试环境，最近 200 行，持续输出。',
    sshTest: '登录测试服务器',
    sshTestDesc: '用部署账号登录。',
    restart: '重启后端服务',
    restartDesc: '改了配置之后用。',
    notes: '备忘',
    release: '发布步骤',
    releaseText:
      '1. 合并到 release 分支\n2. 等流水线变绿\n3. 预发环境回归\n4. 通知测试同事',
    taskReview: '评审详细设计书',
    taskFix: '修复登录页的缺陷',
    taskDeploy: '部署到测试环境',
    subRepro: '复现问题',
    subPatch: '提交修复',
    subVerify: '测试环境验证',
  },
  en: {
    design: 'Design docs',
    basicDesign: 'Basic design',
    detailDesign: 'Detailed design',
    apiSpec: 'API definitions',
    project: 'Project',
    frontend: 'Frontend repo',
    backend: 'Backend repo',
    testEvidence: 'Test evidence',
    dev: 'Dev environment',
    test: 'Test environment',
    staging: 'Staging',
    docs: 'Online docs',
    admin: 'Admin console',
    userSite: 'User site',
    apiDocs: 'API docs',
    logs: 'Log viewer',
    wiki: 'Team wiki',
    tickets: 'Tickets',
    pipeline: 'Build pipeline',
    tools: 'Dev tools',
    cmdPrompt: 'Command Prompt',
    testAccounts: 'Test accounts',
    servers: 'Servers',
    adminAccount: 'Admin console admin',
    testUser: 'Test user A',
    devApp: 'Dev app server',
    testDb: 'Test database',
    stagingApp: 'Staging app server',
    accountNote: 'Test environment only',
    daily: 'Everyday commands',
    tailLogs: 'Follow the backend logs',
    tailLogsDesc: 'Test environment, the last 200 lines, then live.',
    sshTest: 'Log in to the test server',
    sshTestDesc: 'With the deploy account.',
    restart: 'Restart the backend',
    restartDesc: 'After a change of configuration.',
    notes: 'Notes',
    release: 'Release steps',
    releaseText:
      '1. Merge into the release branch\n2. Wait for a green pipeline\n3. Regression on staging\n4. Tell the testers',
    taskReview: 'Review the detailed design',
    taskFix: 'Fix the login page bug',
    taskDeploy: 'Deploy to the test environment',
    subRepro: 'Reproduce it',
    subPatch: 'Push the fix',
    subVerify: 'Verify on test',
  },
}

const group = (id, name, icon, items, open = true) => ({
  id,
  name,
  icon,
  open,
  items,
})
const folder = (id, name, path, icon) => ({
  id,
  kind: 'folder',
  name,
  path,
  icon,
})
const site = (id, name, url, icon) => ({ id, kind: 'website', name, url, icon })
const appItem = (id, name, path, icon) => ({
  id,
  kind: 'app',
  name,
  path,
  icon,
})
const account = (id, name, username, note, icon) => ({
  id,
  kind: 'password',
  name,
  username,
  password: 'placeholder-not-a-secret',
  note,
  icon,
})
const command = (id, name, description, content, language, icon) => ({
  id,
  kind: 'command',
  name,
  description,
  content,
  language,
  icon,
})

/** The collections of the demo, in `lang` ('zh' or 'en'), and the tasks of the day `today`. */
function demoData(lang, today) {
  const t = TEXT[lang]
  const folders = [
    group('g-design', t.design, 'tile:file-text:1', [
      folder(
        'f-basic',
        t.basicDesign,
        'D:\\acme-portal\\docs\\basic-design',
        'tile:file-doc:1'
      ),
      folder(
        'f-detail',
        t.detailDesign,
        'D:\\acme-portal\\docs\\detailed-design',
        'tile:file-doc:2'
      ),
      folder(
        'f-api',
        t.apiSpec,
        'D:\\acme-portal\\docs\\api',
        'tile:file-code:3'
      ),
    ]),
    group('g-project', t.project, 'tile:briefcase:0', [
      folder(
        'f-front',
        t.frontend,
        'D:\\acme-portal\\frontend',
        'tile:folder:0'
      ),
      folder('f-back', t.backend, 'D:\\acme-portal\\backend', 'tile:folder:6'),
      folder(
        'f-evidence',
        t.testEvidence,
        'D:\\acme-portal\\test-evidence',
        'tile:images:9'
      ),
    ]),
  ]
  const websites = [
    group('g-dev', t.dev, 'tile:code:3', [
      site(
        's-dev-admin',
        t.admin,
        'https://dev-admin.example.com',
        'tile:browser:3'
      ),
      site(
        's-dev-api',
        t.apiDocs,
        'https://dev-api.example.com/docs',
        'tile:code-block:3'
      ),
    ]),
    group('g-test', t.test, 'tile:bug:6', [
      site(
        's-test-admin',
        t.admin,
        'https://test-admin.example.com',
        'tile:browser:6'
      ),
      site(
        's-test-user',
        t.userSite,
        'https://test.example.com',
        'tile:globe:6'
      ),
      site(
        's-test-logs',
        t.logs,
        'https://logs.example.com/test',
        'tile:article:6'
      ),
    ]),
    group(
      'g-staging',
      t.staging,
      'tile:rocket-launch:7',
      [
        site(
          's-stg-admin',
          t.admin,
          'https://staging-admin.example.com',
          'tile:browser:7'
        ),
      ],
      false
    ),
    group(
      'g-docs',
      t.docs,
      'tile:book-open:1',
      [
        site('s-wiki', t.wiki, 'https://wiki.example.com', 'tile:book-open:1'),
        site(
          's-tickets',
          t.tickets,
          'https://tickets.example.com',
          'tile:kanban:8'
        ),
        site('s-ci', t.pipeline, 'https://ci.example.com', 'tile:git-branch:4'),
      ],
      false
    ),
  ]
  const apps = [
    group('g-tools', t.tools, 'tile:wrench:11', [
      appItem(
        'a-ps',
        'PowerShell',
        '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        'tile:terminal-window:1'
      ),
      appItem(
        'a-cmd',
        t.cmdPrompt,
        '%SystemRoot%\\System32\\cmd.exe',
        'tile:terminal-window:11'
      ),
    ]),
  ]
  const passwords = [
    group('g-accounts', t.testAccounts, 'tile:user-circle:6', [
      account(
        'p-admin',
        t.adminAccount,
        'admin@test.example.com',
        t.accountNote,
        'tile:user-circle:6'
      ),
      account(
        'p-user',
        t.testUser,
        'tester.a@test.example.com',
        t.accountNote,
        'tile:user-circle:1'
      ),
    ]),
    group('g-servers', t.servers, 'tile:hard-drives:11', [
      account(
        'p-dev-app',
        t.devApp,
        'deploy@dev-app-01',
        '',
        'tile:hard-drives:3'
      ),
      account(
        'p-test-db',
        t.testDb,
        'app_rw@test-db-01',
        '',
        'tile:database:6'
      ),
      account(
        'p-stg-app',
        t.stagingApp,
        'deploy@staging-app-01',
        '',
        'tile:hard-drives:7'
      ),
    ]),
  ]
  const commands = [
    group('g-daily', t.daily, 'tile:terminal-window:2', [
      command(
        'c-logs',
        t.tailLogs,
        t.tailLogsDesc,
        'kubectl logs -f deploy/backend -n test --tail=200',
        'bash',
        'tile:article:2'
      ),
      command(
        'c-ssh',
        t.sshTest,
        t.sshTestDesc,
        'ssh deploy@test-app-01.example.com',
        'bash',
        'tile:plugs-connected:6'
      ),
      command(
        'c-restart',
        t.restart,
        t.restartDesc,
        'kubectl rollout restart deploy/backend -n test',
        'bash',
        'tile:arrows-clockwise:7'
      ),
    ]),
  ]
  const notes = [
    group('g-notes', t.notes, 'tile:clipboard-text:3', [
      {
        id: 'n-release',
        kind: 'note',
        name: t.release,
        content: t.releaseText,
        icon: 'tile:rocket-launch:5',
      },
    ]),
  ]
  const tasks = {
    [today]: [
      {
        id: 't-review',
        name: t.taskReview,
        icon: 'tile:file-doc:2',
        status: 'done',
        open: false,
        subtasks: [],
      },
      {
        id: 't-fix',
        name: t.taskFix,
        icon: 'tile:bug:7',
        status: 'doing',
        open: true,
        subtasks: [
          { id: 'st-1', name: t.subRepro, status: 'done' },
          { id: 'st-2', name: t.subPatch, status: 'doing' },
          { id: 'st-3', name: t.subVerify, status: 'todo' },
        ],
      },
      {
        id: 't-deploy',
        name: t.taskDeploy,
        icon: 'tile:rocket-launch:6',
        status: 'todo',
        open: false,
        subtasks: [],
      },
    ],
  }
  const collections = { folders, websites, apps, passwords, commands, notes }
  const topOrder = {}
  const loose = {}
  for (const [tab, groups] of Object.entries(collections)) {
    topOrder[tab] = groups.map((entry) => ({ type: 'group', id: entry.id }))
    loose[tab] = []
  }

  return { ...collections, topOrder, loose, tasks }
}

module.exports = { demoData }
