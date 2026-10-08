# 8d0：完整验证的历史失败与R20有限后继

本目录封存 source candidate `8d0c8ab2e6049a14944bdd2c2dcc5464c29d2aa4`/tree `a0fd75c9676ff12f8a6c5d75d007c9bd1dd7d8ea` 的已终局完整尝试、独立阶段、成本/资源审计和精确官方CI。整体 **FAILED**：统一unit仅pending；独立integration有原300秒截断、distribution pending和harness真实断言失败。独立E2E/package通过不覆盖失败。另把post-8d0 R20 controlled原件单独放followup-r20/，不冒称8d0产物。

原件见 [压缩包](closed-8d0-release.tar.gz)，SHA256 `022d3e98fa744f76e88c3f8b4ad6f8a49ddaf61a7d94f2888284df113e2f10b3`。76 件原文件、33809712 字节；含历史矩阵/inventory/SHA共 79 件、34060469 字节，tar 5531936 字节。[manifest](manifest.json)及[逐件回读](archive-readback-verification.json)核对了每件SHA、source dev/ino/uid/mode/size/mtime稳定、CI原37件清单和两ZIP CRC/下载SHA。

- 本地统一原命令/预算：clean gen373，unit824/824、4970pass/0fail/127skip/388TODO，exit1仅pending；入口332858.515417ms。统一integration/E2E/package均not-run。
- 独立integration入口314069.731875ms、exit1：主44文件43drained、active016/queued0、四计数unknown。016准入279526.608ms、余20473.392ms；distribution1/1为3pass/0fail/0skip/1TODO，仅pending；harness292cases291pass/1fail，elapsed999ms未达1000ms下界。
- 同输入独立E2E35pass/0fail/0cancel/0skip/0TODO，TAP19702.700833ms/入口20070.241875ms，journal436/699、SSE2097/3351；真实package入口5054.43125ms通过，2073members/12504715bytes，tar SHA851e85fcd18a6f1b33cd07dc64e505280fd199698cdb1639002c2ed1275c96d9。
- 精确 [CI37779568695](https://github.com/dyx13/vibe-fs/actions/runs/37779568695)/job113318949624，unit824/824、4969pass/0fail/128skip/388TODO，stage266.7s、failure仅pending；后三阶段not-run。artifact11551419792 published/download SHAaa7b88e6b257e87e1cddbd16d1abcacb72fed76866478c7537e67ba462beab91匹配，完整ZIP CRC通过；远端完整digest未上传，仍unknown。

unit203/203 monitors和1232knownPID ESRCH、integration46knownPID ESRCH、对应inner accepted及wrapper monitor ESRCH只证精确集合/时点。CI201monitor完整phase、closed0、无drainfailed；远端PID ESRCH/完整FS移除未上传为unknown。822complete/2invalid成本观测不算断言失败；filesystem/mount/全资源清理均不泛化，归档没有kill/delete资源。

R20 followup修复仅readiness fixed performance.now截止线，timer callback若早于原deadline则按remaining ceil重排，不续期；保真实重复HTTP unready请求和1000≤elapsed<2000。原物理999ms日志不能定位native timer量化与Date跳变各自原因；正式受控墙钟正负跳/monotonic999早callback红0pass/1fail219.273709ms，绿1pass/0fail150.190542ms。仅dirty native-JS正式单case，不借gen373作新鲜构建；完整006/harness及下一candidate全量/精确CI待验。早版正式red219.415167ms也保留。

本输入六physical016补跑not-run，必须接下一新candidate。opening append换Root无正式证明、388TODO/skip、历史吞吐具体环境根因unknown保留；一次本地/CI824排空不授稳定吞吐。后续docs-only最终提交与本sourcecandidate分开核精确CI，不覆盖R18/R19归档。
