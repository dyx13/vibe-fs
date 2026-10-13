namespace Wanxiangshu.OpenCode

module ForbiddenSessionSnapshot =
    let consumeMessage (message: SessionMessage) = message

    let consumePort (port: ISessionSnapshotPort) = port
