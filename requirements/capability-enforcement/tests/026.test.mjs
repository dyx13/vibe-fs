import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const forkTool = await import('../../../dist/Execution/Delegation/Fork/OpenCode/ToolSurface.js')
const toolModule = await import('@opencode-ai/plugin/tool')

const ownerDescriptor = (sessionId) => [{ sessionId, agent: 'manager' }]

const acceptNextPrompt = async (runtime, index, pending) => {
  await Promise.race([
    forkTool.awaitPromptCount(runtime, index + 1),
    pending.then((result) => { throw new Error(`Delegation finished before prompt admission: ${result}`) }),
  ])
  assert.equal(forkTool.acceptPrompt(runtime, index), true)
}

test('WHAT[capability-enforcement-026] D01_resume_fixed_devops_rejected_before_review_accepted', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-mgr-devops-d01-'))
  const owner = 'manager-devops-d01'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    await forkTool.injectAuditPendingIncumbency(runtime, owner)
    const resumed = forkTool.executeManagerResume(
      runtime,
      toolModule,
      owner,
      '',
      'devops',
      'DEVOPS-RUN-TESTS-BEFORE-REVIEW',
    )
    const result = await resumed
    // WHAT[capability-enforcement-026]: 在当前迭代的 Review 被系统接纳前，严禁 Manager 向绑定的固定 DevOps 派发任何任务。
    // 依据 harness 暴露的计数与状态观察能力断言拒绝效果（零副作用、未派工、未发 prompt、非承接）：
    assert.equal(typeof result, 'string', 'Resume must return structured consequence')
    assert.doesNotMatch(
      result,
      /carries this charge now|现已接下这项托付/i,
      'Resume response must not establish successful handover before review is accepted',
    )
    assert.equal(forkTool.childCount(runtime), 0, 'No child session may be created when resume is rejected')
    assert.equal(forkTool.promptCount(runtime), 0, 'No prompt may be emitted when resume is rejected')
    assert.equal(forkTool.child(runtime), null, 'No child handle may exist when resume is rejected')
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[capability-enforcement-026] D03_resume_devops_enters_normal_flow_after_review_accepted', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-mgr-devops-d03-'))
  const owner = 'manager-devops-d03'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    // 注入已接纳评审事实（AcceptedAssessment）
    await forkTool.injectAcceptedAssessment(runtime, owner)

    const resumed = forkTool.executeManagerResume(
      runtime,
      toolModule,
      owner,
      '',
      'devops',
      'DEVOPS-RUN-TESTS-AFTER-REVIEW',
    )
    await acceptNextPrompt(runtime, 0, resumed)
    const result = await resumed
    // 接纳评审后，Manager 恢复向固定 DevOps 派工的正常流程，交接成功
    assert.match(result, /devops/)
    assert.match(result, /carries this charge now|现已接下这项托付/i)
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[capability-enforcement-026] D02_resume_legitimate_existing_readonly_engineer_unaffected_before_review_acceptance', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-mgr-eng-d02-'))
  const owner = 'manager-eng-d02'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    await forkTool.injectAuditPendingIncumbency(runtime, owner)
    // 1. Manager 先派出合法 Engineer 子会话进行调查
    const forked = forkTool.executeManagerFork(
      runtime,
      toolModule,
      owner,
      'engineer',
      'Ada',
      'INVESTIGATE-INITIAL-CODEBASE',
    )
    await acceptNextPrompt(runtime, 0, forked)
    await forked

    // 完成第一轮调查并结算
    assert.equal(await forkTool.settle(runtime, owner, 'ADA-FIRST-SETTLED', 'run-ada-1'), true)

    // 2. 在 Review 接纳前，Manager resume 已有的合法只读 Engineer（Ada）
    // 该 resume 路径面向 Engineer，绝不应被 DevOps 的未评审门禁误伤
    const resumed = forkTool.executeManagerResume(
      runtime,
      toolModule,
      owner,
      '',
      'Ada',
      'CONTINUE-INVESTIGATION-BEFORE-REVIEW',
    )
    await acceptNextPrompt(runtime, 1, resumed)
    const result = await resumed
    assert.match(result, /Ada/)
    assert.match(result, /carries this charge now|现已接下这项托付/i)
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[capability-enforcement-026] D04_review_authorized_busy_devops_receives_guidance_on_the_original_work', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-mgr-devops-d04-'))
  const owner = 'manager-devops-d04'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    // 1. 接纳评审，使 Manager 具备向绑定的固定 DevOps 派工的资格
    await forkTool.injectAcceptedAssessment(runtime, owner)

    // 2. 参照 delegation 003 / 024 成功模式：发起第一次 DevOps 派工，基于事件驱动等待首条 prompt 发射
    const firstResumePromise = forkTool.executeManagerResume(
      runtime,
      toolModule,
      owner,
      '',
      'devops',
      'DEVOPS-RUNNING-INITIAL-VERIFICATION',
    )
    await acceptNextPrompt(runtime, 0, firstResumePromise)

    const firstResume = await firstResumePromise
    assert.match(firstResume, /devops/)
    assert.match(firstResume, /carries this charge now|现已接下这项托付/i)

    // 3. 观测 DevOps 状态已确立为活跃且处于 in-flight 派发状态（进入 PendingRuns）
    assert.equal(forkTool.durableLifecycleByname(runtime, owner, 'devops'), 'Active')
    assert.equal(forkTool.promptCount(runtime), 1)

    const original = forkTool.workSnapshot(runtime, owner)
    const listeners = forkTool.terminalListenerCount(runtime)
    const completeOriginal = await forkTool.prepareTerminalDelivery(runtime, owner, 'D04-ORIGINAL-WORK-DONE', 'devops-original-run')
    forkTool.acceptNextPrompt(runtime)
    const secondResume = await forkTool.executeManagerResume(
      runtime,
      toolModule,
      owner,
      '',
      'devops',
      'DEVOPS-ANOTHER-TASK-WHILE-BUSY',
    )
    assert.match(secondResume, /guidance|指导/i)
    assert.equal(forkTool.promptCount(runtime), 2)
    assert.match(forkTool.prompt(runtime, 1), /DEVOPS-ANOTHER-TASK-WHILE-BUSY/)
    assert.deepEqual(forkTool.workSnapshot(runtime, owner), original)
    assert.deepEqual(await forkTool.coldWorkSnapshot(directory, owner), original)
    assert.equal(forkTool.terminalListenerCount(runtime), listeners)
    assert.equal(forkTool.abortCount(runtime), 0)
    assert.equal(forkTool.durableLifecycleByname(runtime, owner, 'devops'), 'Active')
    await completeOriginal()
    assert.match(await forkTool.executeJoin(runtime, owner), /D04-ORIGINAL-WORK-DONE/)
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[capability-enforcement-026] D05_case_variation_and_unbound_identity_cannot_bypass_devops_gate', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-mgr-devops-d05-'))
  const owner = 'manager-devops-d05'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    await forkTool.injectAuditPendingIncumbency(runtime, owner)
    // 评审未接纳状态下，通过大小写变形或带空格尝试绕过 DevOps 门禁
    const variations = ['DEVops', 'DevOps ', ' devops ', 'DEVOPS']
    for (const name of variations) {
      const res = await forkTool.executeManagerResume(
        runtime,
        toolModule,
        owner,
        '',
        name,
        'BYPASS-ATTEMPT',
      )
      // 真实归属识别为 devops，在 review 接纳前均被严格拒绝，零副作用
      assert.doesNotMatch(res, /carries this charge now|现已接下这项托付/i)
      assert.equal(forkTool.childCount(runtime), 0, `No child session may be created for bypass attempt '${name}'`)
    }

    // 尝试传入非本路绑定的未知身份
    const unbound = await forkTool.executeManagerResume(
      runtime,
      toolModule,
      owner,
      '',
      'stranger-operator',
      'UNBOUND-ATTEMPT',
    )
    assert.match(unbound, /没有以该 name|不为人知|unknown|person-unknown|No continuing person is known by that name/i)
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[capability-enforcement-026] D06_fork_devops_or_creating_alternative_devops_remains_strictly_denied', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-mgr-devops-d06-'))
  const owner = 'manager-devops-d06'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  try {
    // 1. Manager 试图通过 calling: 'devops' 进行 fork：同步拒绝 calling-conflict（只能 fork Engineer）
    const resCalling = await forkTool.executeManagerFork(
      runtime,
      toolModule,
      owner,
      'devops',
      'Operator1',
      'FORK-DEVOPS-ATTEMPT',
    )
    assert.match(resCalling, /unknown-calling|only targets Engineer|只能 fork Engineer|未结识的 calling/i)
    assert.equal(forkTool.childCount(runtime), 0, 'No child may be placed for invalid calling')

    // 2. 接纳评审并绑定固定 DevOps，使其名字属于当前持续历史
    await forkTool.injectAcceptedAssessment(runtime, owner)
    const pending = forkTool.executeManagerResume(
      runtime,
      toolModule,
      owner,
      '',
      'devops',
      'BIND-DEVOPS-FIRST',
    )
    await acceptNextPrompt(runtime, 0, pending)
    const bound = await pending
    assert.match(bound, /devops/)

    // 3. Manager 试图通过 name: 'devops' 创建替代 devops：同步拒绝 name-already-belongs
    const resName = await forkTool.executeManagerFork(
      runtime,
      toolModule,
      owner,
      'engineer',
      'devops',
      'REPLACE-DEVOPS-ATTEMPT',
    )
    assert.match(
      resName,
      /name-already-belongs|已属于|already belongs/i,
      'Forking an engineer with existing devops byname must be rejected synchronously',
    )
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WHAT[capability-enforcement-026] D07_pre_review_devops_refusal_preserves_all_durable_bytes_and_accepted_review_admits_the_same_charge', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wxs-mgr-devops-d07-'))
  const owner = 'manager-devops-d07'
  const charge = 'D07-VERIFY-THE-SAME-CHARGE'
  const runtime = await forkTool.createRuntime(directory, ownerDescriptor(owner))

  const durableSnapshot = () => {
    const snapshot = []
    const visit = (relativePath) => {
      const entries = readdirSync(join(directory, relativePath), { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))
      for (const entry of entries) {
        const path = join(relativePath, entry.name)
        if (entry.isDirectory()) {
          snapshot.push({ path, kind: 'directory' })
          visit(path)
        } else {
          assert.equal(entry.isFile(), true, 'the isolated durable boundary must contain only directories and regular files')
          snapshot.push({ path, kind: 'file', bytes: readFileSync(join(directory, path)).toString('base64') })
        }
      }
    }
    visit('')
    return snapshot
  }

  try {
    const initial = durableSnapshot()
    await forkTool.injectAuditPendingIncumbency(runtime, owner)
    const beforeReview = durableSnapshot()
    assert.notDeepEqual(beforeReview, initial, 'current incumbency admission must really reach the durable boundary')
    assert.ok(beforeReview.some((entry) => entry.kind === 'file' && entry.bytes.length > 0), 'the snapshot must observe a nonempty real store')
    assert.equal(forkTool.durableLifecycleByname(runtime, owner, 'devops'), null)

    for (const name of ['devops', 'DEVOPS', ' DevOps ']) {
      const pending = forkTool.executeManagerResume(runtime, toolModule, owner, '', name, charge)
      const result = await Promise.race([
        pending,
        forkTool.awaitPromptCount(runtime, 1).then(() => {
          throw new Error('Pre-review DevOps dispatch reached the physical prompt boundary')
        }),
      ])
      assert.match(result, /review|评审/i, 'refusal must identify the missing review admission, not an unknown person or broken harness')
      assert.doesNotMatch(result, /carries this charge now|现已接下这项托付/i)
      assert.deepEqual(durableSnapshot(), beforeReview, 'rejected ' + name + ' must not append, create, remove or rewrite any durable file')
      assert.equal(forkTool.durableLifecycleByname(runtime, owner, 'devops'), null)
      assert.equal(forkTool.childCount(runtime), 0)
      assert.equal(forkTool.promptCount(runtime), 0)
      assert.equal(forkTool.child(runtime), null)
    }

    await forkTool.injectAcceptedAssessment(runtime, owner)
    const afterReview = durableSnapshot()
    assert.notDeepEqual(afterReview, beforeReview, 'review acceptance must be a real durable transition')

    const pending = forkTool.executeManagerResume(runtime, toolModule, owner, '', 'devops', charge)
    await acceptNextPrompt(runtime, 0, pending)
    const result = await pending
    assert.match(result, /carries this charge now|现已接下这项托付/i)
    assert.equal(forkTool.durableLifecycleByname(runtime, owner, 'devops'), 'Active')
    assert.equal(forkTool.childCount(runtime), 1)
    assert.equal(forkTool.promptCount(runtime), 1)
    assert.notDeepEqual(durableSnapshot(), afterReview, 'the same admitted charge must reach real persistence, excluding an inert store or blanket refusal')
  } finally {
    forkTool.disposeRuntime(runtime)
    rmSync(directory, { recursive: true, force: true })
  }
})
