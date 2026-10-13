namespace Wanxiangshu.Host.CompilerProbe

open Wanxiangshu.OpenCode
open Wanxiangshu.Foundation.Identity

module LegalSession =
    let send (port: ISessionHostPort) (source: ProviderAttemptSource) text (options: SessionPromptOptions) =
        port.SendPrompt(source.SessionId, text, options)

    let subscribe (port: ISessionHostPort) (source: ProviderAttemptSource) listener =
        port.SubscribeTerminal(source.SessionId, listener)

    let dispose (owner: ISessionRuntimeOwner) (source: ProviderAttemptSource) =
        owner.DisposeSession(SessionId.value source.SessionId)

    let verify () =
        let source: ProviderAttemptSource =
            { SessionId = SessionId.create "session-probe"
              PhysicalUserMessageId = PhysicalUserMessageId.create "physical-probe"
              AuthorityRootUserMessageId = AuthorityRootUserMessageId.create "authority-probe"
              ProviderRun = ProviderRunIdentity.create "run-probe" }

        if SessionId.value source.SessionId <> "session-probe" then
            failwith "Session identity changed"

        if ProviderRunIdentity.value source.ProviderRun <> "run-probe" then
            failwith "Provider run identity changed"
