namespace Wanxiangshu.Host.CompilerProbe

open Wanxiangshu.Context.Trace
open Wanxiangshu.Persistence.Journal

module ForbiddenDurableCapture =
    let capture (journal: AgentJournal option) =
        XTraceCapture.captureSessionMessagesWithReceipt journal
