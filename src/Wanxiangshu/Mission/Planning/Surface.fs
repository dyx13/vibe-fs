namespace Wanxiangshu.Mission.Planning

open System
open System.Threading.Tasks
open Fable.Core.JsInterop
open Thoth.Json
open Wanxiangshu.Context.Trace
open Wanxiangshu.Foundation
open Wanxiangshu.Foundation.Identity
open Wanxiangshu.OpenCode
open Wanxiangshu.Persistence.EventStore

module PlanningSurface =

    let empty () : PlanWorkState = PlanFold.initialWorkState

    let workOpened (workId: string) (root: string) : PlanEvent = PlanEvents.workOpened workId root

    let devOpsBound (workId: string) (devopsId: string) (targetVal: obj) : PlanEvent =
        let target =
            match targetVal with
            | :? string as s -> Some s
            | :? (string list) as l -> List.tryHead l
            | :? (string array) as arr -> Array.tryHead arr
            | _ -> None

        PlanEvents.devOpsBound workId devopsId target

    let incumbencyOpened (workId: string) (incumbencyId: string) (stageVal: obj) (openingCursor: int64) : PlanEvent =
        let stage =
            match stageVal with
            | :? PlanStage as s -> s
            | :? string as s -> PlanStage.ofString s |> Option.defaultValue PlanStage.S1
            | _ -> PlanStage.S1

        PlanEvents.incumbencyOpened workId incumbencyId stage openingCursor

    let incumbencyRetired (incumbencyId: string) (outcomeVal: obj) (retirementCursor: int64) : PlanEvent =
        let outcome =
            match outcomeVal with
            | :? PlanRetirementOutcome as o -> o
            | :? string as s ->
                PlanRetirementOutcome.ofString s
                |> Option.defaultValue PlanRetirementOutcome.Relayed
            | _ -> PlanRetirementOutcome.Relayed

        PlanEvents.incumbencyRetired incumbencyId outcome retirementCursor

    let delivered
        (incumbencyId: string)
        (workId: string)
        (digest: string)
        (path: string)
        (execSessionId: string)
        : PlanEvent =
        PlanEvents.delivered incumbencyId workId digest path execSessionId

    let reviewed (incumbencyId: string) (stageVal: obj) (outcomeVal: obj) : PlanEvent =
        let stage =
            match stageVal with
            | :? PlanStage as s -> s
            | :? string as s -> PlanStage.ofString s |> Option.defaultValue PlanStage.S1
            | _ -> PlanStage.S1

        let outcome =
            match outcomeVal with
            | :? PlanReviewedOutcome as o -> o
            | :? string as s -> PlanReviewedOutcome.ofString s |> Option.defaultValue PlanReviewedOutcome.Stayed
            | _ -> PlanReviewedOutcome.Stayed

        PlanEvents.reviewed incumbencyId stage outcome

    let reopened (incumbencyId: string) : PlanEvent = PlanEvents.reopened incumbencyId

    let applyWorkEvent (event: PlanEvent) (state: PlanWorkState) : obj = PlanFold.applyWorkEventJs event state

    let activeStage (state: PlanWorkState) : string option =
        match state.Active with
        | Some act -> Some(PlanStage.render act.Stage)
        | None -> None

    let retiredCount (state: PlanWorkState) : int = state.Retired.Length

    let latestRetirementRange (state: PlanWorkState) : (int64 * int64) option =
        state.LatestRetirement
        |> Option.map (fun (_, _, startC, endC) -> (XTraceCursor.sequence startC, XTraceCursor.sequence endC))

    /// The predecessor range the active tenure inherited at opening: the
    /// consumed range of the tenure it relays from (planning-017).
    let predecessorRange (state: PlanWorkState) : (int64 * int64) option =
        state.PredecessorRange
        |> Option.map (fun (startCursor, endCursor) ->
            XTraceCursor.sequence startCursor, XTraceCursor.sequence endCursor)

    let activeOpeningCursor (state: PlanWorkState) : int64 option =
        state.Active
        |> Option.map (fun active -> XTraceCursor.sequence active.OpeningCursor)

    let isDelivered (state: PlanWorkState) : bool = state.Delivered.IsSome

    let deliveredDigest (state: PlanWorkState) : string option =
        match state.Delivered with
        | Some d -> Some d.Digest
        | None -> None

    let deliveryReceipt (state: PlanWorkState) : PlanDeliveryReceipt option = state.Delivered

    let isActionAllowed (request: obj) : bool = ActionGate.isActionAllowed request

    let private rejectionCode (rejection: ActionGateRejection) : string =
        match rejection with
        | ActionGateRejection.AlreadyDelivered -> "AlreadyDelivered"
        | ActionGateRejection.HandoffRetired -> "HandoffRetired"
        | ActionGateRejection.ResumeRetired -> "ResumeRetired"
        | ActionGateRejection.BlockedByLiveResources _ -> "BlockedByLiveResources"
        | ActionGateRejection.ReviewRequired -> "ReviewRequired"
        | ActionGateRejection.ActionDenied _ -> "ActionDenied"

    let decideAction
        (stageStr: string)
        (action: string)
        (hasDelivered: bool)
        (hasBlocker: bool)
        (hasReviewedVal: obj)
        : obj =
        match PlanStage.ofString stageStr with
        | Some stage ->
            let hasReviewed =
                if isNull hasReviewedVal || jsTypeof hasReviewedVal = "undefined" then
                    true
                else
                    unbox<bool> hasReviewedVal

            match ActionGate.decideActionWithReview stage action hasDelivered hasBlocker hasReviewed with
            | Ok() -> box {| ok = true; rejection = null |}
            | Error rej ->
                box
                    {| ok = false
                       rejection = rejectionCode rej |}
        | None ->
            box
                {| ok = false
                   rejection = "InvalidStage" |}

    let allowedPermissions (stageStr: string) (hasDelivered: bool) (hasBlocker: bool) : string array =
        match PlanStage.ofString stageStr with
        | Some stage ->
            ActionGate.allowedPermissions stage hasDelivered hasBlocker
            |> Set.toArray
            |> Array.choose (function
                | ToolPermission.JsPlan -> Some "JsPlan"
                | ToolPermission.Ask -> Some "Ask"
                | ToolPermission.Review -> Some "Review"
                | ToolPermission.Deliver -> Some "Deliver"
                | _ -> None)
            |> Array.sort
        | None -> [||]

    let encodeEventJson (event: PlanEvent) : string =
        let payload = PlanEventCodec.encodePayload event
        Wanxiangshu.Foundation.CanonicalJson.canonicalJson payload

    let decodeEventJson (eventType: string) (json: string) : obj =
        match Decode.fromString Decode.value json with
        | Ok payload ->
            match PlanEventCodec.decodePayload eventType payload with
            | Ok ev ->
                box
                    {| ok = true
                       event = ev
                       error = null |}
            | Error err ->
                box
                    {| ok = false
                       event = Unchecked.defaultof<PlanEvent>
                       error = err |}
        | Error parseErr ->
            box
                {| ok = false
                   event = Unchecked.defaultof<PlanEvent>
                   error = sprintf "%A" parseErr |}

    let toCanonicalEnvelopeJson (workId: string) (event: PlanEvent) (parents: string list) : string =
        let parentIds = parents |> List.map EventId.create
        let envelope = PlanEventCodec.toEnvelope (PlanWorkId.create workId) event parentIds
        PlanEventCodec.encodeCanonicalJson envelope

    let private unpackEventDetails (ev: PlanEvent) =
        match ev with
        | PlanEvent.PlanWorkOpened(wid, root) -> (PlanEventTypes.WorkOpened, PlanWorkId.value wid, null, null, 0L, root)
        | PlanEvent.PlanDevOpsBound(wid, devopsId, _) ->
            (PlanEventTypes.DevOpsBound, PlanWorkId.value wid, null, null, 0L, devopsId)
        | PlanEvent.PlanIncumbencyOpened(wid, iid, st, cur) ->
            (PlanEventTypes.IncumbencyOpened,
             PlanWorkId.value wid,
             PlanIncumbencyId.value iid,
             PlanStage.render st,
             XTraceCursor.sequence cur,
             null)
        | PlanEvent.PlanIncumbencyRetired(iid, outc, cur) ->
            (PlanEventTypes.IncumbencyRetired,
             null,
             PlanIncumbencyId.value iid,
             PlanRetirementOutcome.render outc,
             XTraceCursor.sequence cur,
             null)
        | PlanEvent.PlanDelivered(iid, wid, dig, p, execSid) ->
            (PlanEventTypes.Delivered, PlanWorkId.value wid, PlanIncumbencyId.value iid, dig, 0L, p + " exec=" + execSid)
        | PlanEvent.PlanReviewed(iid, st, outc) ->
            (PlanEventTypes.Reviewed,
             null,
             PlanIncumbencyId.value iid,
             PlanReviewedOutcome.render outc,
             0L,
             PlanStage.render st)
        | PlanEvent.PlanReopened(iid) -> (PlanEventTypes.Reopened, null, PlanIncumbencyId.value iid, null, 0L, null)

    let tryDecodeEnvelopeJson (envelopeJson: string) : obj =
        let textWithLf =
            if envelopeJson.EndsWith("\n") then
                envelopeJson
            else
                envelopeJson + "\n"

        match CanonicalEventCodec.tryDecode textWithLf with
        | Ok envelope ->
            match PlanEventCodec.tryDecodeEnvelope envelope with
            | Ok ev ->
                let (evType, wId, iId, st, cur, _) = unpackEventDetails ev

                box
                    {| ok = true
                       event = ev
                       eventType = evType
                       workId = wId
                       incumbencyId = iId
                       stage = st
                       cursor = cur
                       error = null |}
            | Error err ->
                box
                    {| ok = false
                       event = Unchecked.defaultof<PlanEvent>
                       eventType = null
                       workId = null
                       incumbencyId = null
                       stage = null
                       cursor = 0L
                       error = err |}
        | Error _ ->
            try
                let parsed: obj = emitJsExpr envelopeJson "JSON.parse($0)"

                let eventType: string =
                    let et = emitJsExpr parsed "$0.event_type || $0.EventType"
                    if isNull et then "" else unbox<string> et

                let payload: JsonValue =
                    emitJsExpr
                        parsed
                        "$0.payload !== undefined ? $0.payload : ($0.Payload !== undefined ? $0.Payload : $0)"

                if String.IsNullOrEmpty eventType then
                    box
                        {| ok = false
                           event = Unchecked.defaultof<PlanEvent>
                           eventType = null
                           workId = null
                           incumbencyId = null
                           stage = null
                           cursor = 0L
                           error = "Missing event_type or EventType in envelope JSON" |}
                else
                    match PlanEventCodec.decodePayload eventType payload with
                    | Ok ev ->
                        let (evType, wId, iId, st, cur, _) = unpackEventDetails ev

                        box
                            {| ok = true
                               event = ev
                               eventType = evType
                               workId = wId
                               incumbencyId = iId
                               stage = st
                               cursor = cur
                               error = null |}
                    | Error err ->
                        box
                            {| ok = false
                               event = Unchecked.defaultof<PlanEvent>
                               eventType = null
                               workId = null
                               incumbencyId = null
                               stage = null
                               cursor = 0L
                               error = err |}
            with ex ->
                box
                    {| ok = false
                       event = Unchecked.defaultof<PlanEvent>
                       eventType = null
                       workId = null
                       incumbencyId = null
                       stage = null
                       cursor = 0L
                       error = ex.Message |}

    let append (store: IEventStore) (workId: string) (event: PlanEvent) : Task<obj> =
        task {
            match! PlanEventStore.append store (PlanWorkId.create workId) event with
            | Ok eventId ->
                return
                    box
                        {| ok = true
                           eventId = EventId.value eventId
                           error = null |}
            | Error err ->
                return
                    box
                        {| ok = false
                           eventId = null
                           error = err |}
        }

    let getPlanWorkState (store: IEventStore) (workId: string) : obj =
        match PlanEventStore.workState store (PlanWorkId.create workId) with
        | Some st -> box {| found = true; state = st |}
        | None ->
            box
                {| found = false
                   state = Unchecked.defaultof<PlanWorkState> |}

    let getPlanWorkView (store: IEventStore) (workId: string) : obj =
        match PlanEventStore.view store (PlanWorkId.create workId) with
        | Some v -> box {| found = true; view = v |}
        | None ->
            box
                {| found = false
                   view = Unchecked.defaultof<PlanWorkView> |}

    let getPlanWorkStateFromIntegrator (integrator: ICanonicalIntegrator) (workId: string) : obj =
        match PlanEventStore.workStateFromIntegrator integrator (PlanWorkId.create workId) with
        | Some st -> box {| found = true; state = st |}
        | None ->
            box
                {| found = false
                   state = Unchecked.defaultof<PlanWorkState> |}

    let getPlanWorkViewFromIntegrator (integrator: ICanonicalIntegrator) (workId: string) : obj =
        match PlanEventStore.viewFromIntegrator integrator (PlanWorkId.create workId) with
        | Some v -> box {| found = true; view = v |}
        | None ->
            box
                {| found = false
                   view = Unchecked.defaultof<PlanWorkView> |}

    let private sequenceOfJs (value: obj) : int64 =
        if not (emitJsExpr value "typeof $0 === 'bigint' && $0 >= 0n") then
            invalidArg (nameof value) "Plan cursor must be a nonnegative bigint"

        unbox<int64> value

    let assembleTenureMessages
        (messages: obj)
        (tenureObj: obj)
        (materializePrev: obj -> string)
        (messageCursors: obj)
        : obj =
        let previousRange =
            if isNull tenureObj?previousRange then
                None
            else
                let range = unbox<obj array> tenureObj?previousRange
                Some(sequenceOfJs range.[0], sequenceOfJs range.[1])

        let tenure =
            { WorkId = unbox<string> tenureObj?workId
              IncumbencyId = unbox<string> tenureObj?incumbencyId
              Stage = unbox<string> tenureObj?stage
              OpeningCursor = sequenceOfJs tenureObj?openingCursor
              PreviousRange = previousRange
              IsFreshHandover = unbox<bool> tenureObj?isFreshHandover }

        let cursors =
            emitJsExpr messageCursors "Object.entries($0)"
            |> unbox<obj array array>
            |> Array.map (fun entry -> unbox<string> entry.[0], sequenceOfJs entry.[1])
            |> Map.ofArray

        let previousRecord =
            previousRange
            |> Option.map (fun (startCursor, endCursor) ->
                materializePrev (
                    box
                        {| start = startCursor
                           ``end`` = endCursor |}
                ))

        let assembled =
            TenureIsolation.assemble
                (unbox<obj array> messages
                 |> Array.toList
                 |> List.choose (fun raw ->
                     ProviderWireCapture.decodeCapturedMessage raw
                     |> Option.map (fun message ->
                         { Id = ProviderWireDecode.hostMessageId raw
                           Role = message.Role
                           IsSynthetic = ProviderWireCapture.isSyntheticMessage raw
                           HasSemanticParts = not (List.isEmpty message.Parts)
                           Raw = raw })))
                tenure
                cursors
                previousRecord

        box
            {| messages = assembled.Messages |> List.toArray
               reanchorRequested = assembled.ReanchorRequested |}

    let validateWorkId (workId: string) : obj =
        match PlanPath.validateWorkId workId with
        | Ok key -> box {| ok = true; key = key; error = null |}
        | Error err ->
            box
                {| ok = false
                   key = null
                   error = err |}

    let canonicalWorkKey (workId: string) : obj =
        match PlanPath.canonicalWorkKey workId with
        | Ok key -> box {| ok = true; key = key; error = null |}
        | Error err ->
            box
                {| ok = false
                   key = null
                   error = err |}

    let resolvePlanPath (root: string) (workId: string) : obj =
        match PlanPath.resolvePlanPath root workId with
        | Ok path ->
            box
                {| ok = true
                   path = path
                   error = null |}
        | Error err ->
            box
                {| ok = false
                   path = null
                   error = err |}

    let readPlan (root: string) (workId: string) : obj =
        match PlanPath.readPlan root workId with
        | Ok content ->
            box
                {| ok = true
                   content = content
                   error = null |}
        | Error err ->
            box
                {| ok = false
                   content = null
                   error = err |}

    let rewritePlanAtomic (root: string) (workId: string) (content: string) : obj =
        match PlanPath.rewritePlanAtomic root workId content with
        | Ok(path, digest) ->
            box
                {| ok = true
                   path = path
                   digest = digest
                   error = null |}
        | Error err ->
            box
                {| ok = false
                   path = null
                   digest = null
                   error = err |}

    let editPlanAtomic (root: string) (workId: string) (patches: obj) : obj =
        let patchList =
            if isNull patches then
                []
            else
                let arr = unbox<obj array> patches

                arr
                |> Array.toList
                |> List.map (fun p -> (unbox<string> p?find, unbox<string> p?put))

        match PlanPath.editPlanAtomic root workId patchList with
        | Ok(path, digest) ->
            box
                {| ok = true
                   path = path
                   digest = digest
                   error = null |}
        | Error err ->
            box
                {| ok = false
                   path = null
                   digest = null
                   error = err |}

    let private extractStringOpt (v: obj) : string option =
        if isNull v then
            None
        elif emitJsExpr v "Array.isArray($0)" then
            let arr = unbox<obj array> v

            if arr.Length = 0 || isNull arr.[0] then
                None
            else
                Some(unbox<string> arr.[0])
        elif emitJsExpr v "typeof $0 === 'string'" then
            Some(unbox<string> v)
        else
            None

    let private extractInt64Opt (v: obj) : int64 option =
        if emitJsExpr v "typeof $0 === 'bigint'" then
            Some(unbox<int64> v)
        else
            None

    let private spawnOfJs (spawnVal: obj) : string -> string -> Task<string> =
        fun (agent: string) (prompt: string) ->
            // The spawn argument arrives as a plain JavaScript function
            // (agent, prompt) => Promise<sessionId>; call it through JS interop
            // so currying never gets in the way.
            unbox<Task<string>> (emitJsExpr (spawnVal, agent, prompt) "$0($1, $2)")

    let ensurePlanWorkOpened (store: IEventStore) (root: string) (sessionId: string) : Task<obj> =
        task {
            match! PlanWorkOpen.ensurePlanWorkOpened store root sessionId with
            | Ok() -> return box {| ok = true; error = null |}
            | Error err -> return box {| ok = false; error = err |}
        }

    let executeDeliver
        (store: IEventStore)
        (root: string)
        (workId: string)
        (incumbencyId: string)
        (hasBlocker: bool)
        (spawn: obj)
        (retirementCursor: obj)
        : Task<obj> =
        let spawnFn = spawnOfJs spawn

        task {
            let! outcome =
                match extractInt64Opt retirementCursor with
                | None -> Task.FromResult(Error "Plan retirement cursor evidence is required")
                | Some cursor -> PlanTools.executeDeliver store root workId incumbencyId hasBlocker spawnFn cursor

            match outcome with
            | Ok res ->
                return
                    box
                        {| ok = true
                           relayed = res.Relayed
                           delivered = res.Delivered
                           retiredIncumbencyId = res.RetiredIncumbencyId
                           retirementOutcome = res.RetirementOutcome
                           digest = res.Digest
                           path = res.Path
                           execSessionId = res.ExecSessionId
                           nextIncumbencyId = res.NextIncumbencyId
                           message = res.Message
                           error = null |}
            | Error err ->
                return
                    box
                        {| ok = false
                           relayed = false
                           delivered = false
                           retiredIncumbencyId = null
                           retirementOutcome = null
                           digest = null
                           path = null
                           execSessionId = null
                           nextIncumbencyId = null
                           message = null
                           error = err |}
        }

    // The delegate argument arrives as a plain JavaScript function
    // (intent) => Promise<workRecord>; call it through JS interop so currying
    // never gets in the way.
    let private delegateOfJs (delegateVal: obj) : string -> Task<string> =
        fun (intent: string) -> unbox<Task<string>> (emitJsExpr (delegateVal, intent) "$0($1)")

    let executeAsk (store: IEventStore) (workId: string) (intent: string) (delegateTo: obj) : Task<obj> =
        let delegateFn = delegateOfJs delegateTo

        task {
            match! PlanTools.executeAsk store workId intent delegateFn with
            | Ok res ->
                return
                    box
                        {| ok = true
                           kind = res.Kind
                           workRecord = res.WorkRecord
                           status = res.Status
                           error = null |}
            | Error err ->
                return
                    box
                        {| ok = false
                           kind = null
                           workRecord = null
                           status = null
                           error = err |}
        }

    let executeJsPlan (root: string) (workId: string) (action: string) (content: obj) (patches: obj) : obj =
        let contentOpt = extractStringOpt content

        let patchList =
            if isNull patches then
                None
            else
                let arr = unbox<obj array> patches

                Some(
                    arr
                    |> Array.toList
                    |> List.map (fun p -> (unbox<string> p?find, unbox<string> p?put))
                )

        match PlanTools.executeJsPlan root workId action contentOpt patchList with
        | Ok res ->
            box
                {| ok = true
                   output = res
                   error = null |}
        | Error err ->
            box
                {| ok = false
                   output = null
                   error = err |}

    let private extractPlanWorkView (viewVal: obj) : PlanWorkView option =
        match viewVal with
        | :? PlanWorkView as v -> Some v
        | null -> None
        | _ ->
            try
                let wid =
                    if isNull viewVal?WorkId then
                        None
                    else
                        Some(unbox<string> viewVal?WorkId)

                let activeInc =
                    if isNull viewVal?ActiveIncumbencyId then
                        None
                    else
                        Some(unbox<string> viewVal?ActiveIncumbencyId)

                let activeStage =
                    if isNull viewVal?ActiveStage then
                        None
                    else
                        Some(unbox<string> viewVal?ActiveStage)

                let activePhase =
                    if isNull viewVal?ActivePhase then
                        None
                    else
                        Some(unbox<string> viewVal?ActivePhase)

                let activeAuthorized =
                    if isNull viewVal?ActiveAuthorized then
                        None
                    else
                        Some(unbox<bool> viewVal?ActiveAuthorized)

                let retiredCount =
                    if isNull viewVal?RetiredCount then
                        0
                    else
                        unbox<int> viewVal?RetiredCount

                let latestRetOutcome =
                    if isNull viewVal?LatestRetirementOutcome then
                        None
                    else
                        Some(unbox<string> viewVal?LatestRetirementOutcome)

                let latestReviewOutcome =
                    if isNull viewVal?LatestReviewOutcome then
                        None
                    else
                        Some(unbox<string> viewVal?LatestReviewOutcome)

                let delivered =
                    if isNull viewVal?Delivered then
                        false
                    else
                        unbox<bool> viewVal?Delivered

                let deliveryDigest =
                    if isNull viewVal?DeliveryDigest then
                        None
                    else
                        Some(unbox<string> viewVal?DeliveryDigest)

                let deliveryPath =
                    if isNull viewVal?DeliveryPath then
                        None
                    else
                        Some(unbox<string> viewVal?DeliveryPath)

                let deliveryExecSessionId =
                    if isNull viewVal?DeliveryExecSessionId then
                        None
                    else
                        Some(unbox<string> viewVal?DeliveryExecSessionId)

                let boundDevOpsId =
                    if isNull viewVal?BoundDevOpsId then
                        None
                    else
                        Some(unbox<string> viewVal?BoundDevOpsId)

                Some
                    { WorkId = wid
                      ActiveIncumbencyId = activeInc
                      ActiveStage = activeStage
                      ActivePhase = activePhase
                      ActiveAuthorized = activeAuthorized
                      RetiredCount = retiredCount
                      LatestRetirementOutcome = latestRetOutcome
                      LatestReviewOutcome = latestReviewOutcome
                      Delivered = delivered
                      DeliveryDigest = deliveryDigest
                      DeliveryPath = deliveryPath
                      DeliveryExecSessionId = deliveryExecSessionId
                      BoundDevOpsId = boundDevOpsId }
            with _ ->
                None

    let planRecoveryPosition (viewVal: obj) (readPlanFile: string -> string option) : obj =
        let viewOpt = extractPlanWorkView viewVal

        match viewOpt with
        | None ->
            box
                {| kind = "Conflict"
                   reason = "Invalid PlanWorkView input" |}
        | Some view ->
            match PlanRecovery.planRecoveryPosition view readPlanFile with
            | PlanRecoveryPosition.Delivered(receipt, path, digest) ->
                box
                    {| kind = "Delivered"
                       receipt = receipt
                       path = path
                       digest = digest |}
            | PlanRecoveryPosition.Active(incumbencyId, stage, authorized, planExists) ->
                box
                    {| kind = "Active"
                       incumbencyId = incumbencyId
                       stage = stage
                       authorized = authorized
                       planExists = planExists |}
            | PlanRecoveryPosition.Nothing -> box {| kind = "Nothing" |}
            | PlanRecoveryPosition.Conflict reason -> box {| kind = "Conflict"; reason = reason |}

    let private parseViews (v: obj) : PlanWorkView list =
        if isNull v then
            []
        elif emitJsExpr v "Array.isArray($0)" then
            let arr = unbox<obj array> v

            arr
            |> Array.toList
            |> List.map (fun item ->
                extractPlanWorkView item
                |> Option.defaultValue
                    { WorkId = None
                      ActiveIncumbencyId = None
                      ActiveStage = None
                      ActivePhase = None
                      ActiveAuthorized = None
                      RetiredCount = 0
                      LatestRetirementOutcome = None
                      LatestReviewOutcome = None
                      Delivered = false
                      DeliveryDigest = None
                      DeliveryPath = None
                      DeliveryExecSessionId = None
                      BoundDevOpsId = None })
        else
            match v with
            | :? (PlanWorkView list) as l -> l
            | :? (PlanWorkView array) as arr -> Array.toList arr
            | _ -> []

    let evaluateRecoveryEffects (viewsVal: obj) (readPlanFile: string -> string option) : obj array =
        let views = parseViews viewsVal
        let effects = PlanRecovery.evaluateRecoveryEffects views readPlanFile

        effects
        |> List.map (function
            | PlanRecoveryEffect.DeliveredIdempotent(workId, path) ->
                box
                    {| kind = "DeliveredIdempotent"
                       workId = workId
                       path = path |}
            | PlanRecoveryEffect.ActiveRebound(workId, incumbencyId, stage, authorized, planExists) ->
                box
                    {| kind = "ActiveRebound"
                       workId = workId
                       incumbencyId = incumbencyId
                       stage = stage
                       authorized = authorized
                       planExists = planExists |}
            | PlanRecoveryEffect.Conflict(workId, reason) ->
                box
                    {| kind = "Conflict"
                       workId = workId
                       reason = reason |})
        |> List.toArray

    let allWorkViews (store: IEventStore) : PlanWorkView list = PlanEventStore.allWorkViews store

    let allWorkViewsFromIntegrator (integrator: ICanonicalIntegrator) : PlanWorkView list =
        PlanEventStore.allWorkViewsFromIntegrator integrator

    let reviewTargetFor (stage: string) : string = ReviewPlanBackend.reviewTargetFor stage

    let private parseFindings (findingsVal: obj) : Result<(string * string) list, string> =
        if isNull findingsVal then
            Error "findings must be an array of {acceptance_criteria, work_plan} pairs"
        elif emitJsExpr findingsVal "Array.isArray($0)" then
            let arr = unbox<obj array> findingsVal

            let items =
                arr
                |> Array.toList
                |> List.map (fun (item: obj) ->
                    let acceptance: obj = item?acceptance_criteria
                    let workPlan: obj = item?work_plan

                    if
                        isNull acceptance
                        || isNull workPlan
                        || not (emitJsExpr acceptance "typeof $0 === 'string'")
                        || not (emitJsExpr workPlan "typeof $0 === 'string'")
                        || String.IsNullOrEmpty(unbox<string> acceptance)
                        || String.IsNullOrWhiteSpace(unbox<string> workPlan)
                    then
                        None
                    else
                        Some(unbox<string> acceptance, unbox<string> workPlan))

            let valid = items |> List.choose id

            if valid.Length <> items.Length then
                Error "each finding requires non-empty acceptance_criteria and work_plan strings"
            else
                Ok valid
        else
            Error "findings must be an array of {acceptance_criteria, work_plan} pairs"

    let private gapsToJs (gaps: (string * string) list) : obj array =
        gaps
        |> List.map (fun (acceptance, workPlan) ->
            box
                {| acceptance_criteria = acceptance
                   work_plan = workPlan |})
        |> Array.ofList

    let executeReview
        (store: IEventStore)
        (workId: string)
        (incumbencyId: string)
        (findings: obj)
        (note: obj)
        : Task<obj> =
        // note is accepted for writing and never returned (relay-assessment-001).
        task {
            match parseFindings findings with
            | Error err ->
                return
                    box
                        {| ok = false
                           outcome = null
                           gaps = null
                           error = err |}
            | Ok gaps ->
                match! ReviewPlanBackend.executeReview store workId incumbencyId gaps with
                | Error err ->
                    return
                        box
                            {| ok = false
                               outcome = null
                               gaps = null
                               error = PlanReviewError.render err |}
                | Ok review ->
                    return
                        box
                            {| ok = true
                               outcome = PlanReviewedOutcome.render review.Outcome
                               gaps = gapsToJs review.Gaps
                               error = Unchecked.defaultof<string> |}
        }

    let PlanStage: obj =
        box
            {| S1 = PlanStage.S1
               S2 = PlanStage.S2
               S3 = PlanStage.S3 |}

    let PlanRetirementOutcome: obj =
        box
            {| Relayed = PlanRetirementOutcome.Relayed
               Delivered = PlanRetirementOutcome.Delivered |}

    let PlanReviewedOutcome: obj =
        box
            {| Promoted = PlanReviewedOutcome.Promoted
               Stayed = PlanReviewedOutcome.Stayed |}

    let PlanEvents: obj =
        box
            {| workOpened = workOpened
               devOpsBound = devOpsBound
               incumbencyOpened = incumbencyOpened
               incumbencyRetired = incumbencyRetired
               delivered = delivered
               reviewed = reviewed
               reopened = reopened |}

    let PlanFold: obj =
        box
            {| initialWorkState = Wanxiangshu.Mission.Planning.PlanFold.initialWorkState
               initialState = Wanxiangshu.Mission.Planning.PlanFold.initialState
               applyWorkEventJs =
                fun (ev: PlanEvent) (st: PlanWorkState) -> Wanxiangshu.Mission.Planning.PlanFold.applyWorkEventJs ev st
               applyEventJs =
                fun (ev: PlanEvent) (st: PlanState) -> Wanxiangshu.Mission.Planning.PlanFold.applyEventJs ev st
               applyEventsJs =
                fun (evs: PlanEvent list) (st: PlanState) -> Wanxiangshu.Mission.Planning.PlanFold.applyEventsJs evs st
               workState = fun (wid: string) (st: PlanState) -> Wanxiangshu.Mission.Planning.PlanFold.workState wid st
               view = fun (wid: string) (st: PlanState) -> Wanxiangshu.Mission.Planning.PlanFold.view wid st |}

    let PlanningSurface: obj =
        box
            {| empty = empty
               initialWorkState = Wanxiangshu.Mission.Planning.PlanFold.initialWorkState
               applyWorkEvent = applyWorkEvent
               encodeEventJson = encodeEventJson
               decodeEventJson = decodeEventJson
               toCanonicalEnvelopeJson = toCanonicalEnvelopeJson
               tryDecodeEnvelopeJson = tryDecodeEnvelopeJson
               append = append
               getPlanWorkState = getPlanWorkState
               getPlanWorkView = getPlanWorkView
               getPlanWorkStateFromIntegrator = getPlanWorkStateFromIntegrator
               getPlanWorkViewFromIntegrator = getPlanWorkViewFromIntegrator
               ensurePlanWorkOpened = ensurePlanWorkOpened
               assembleTenureMessages = assembleTenureMessages
               validateWorkId = validateWorkId
               canonicalWorkKey = canonicalWorkKey
               resolvePlanPath = resolvePlanPath
               readPlan = readPlan
               rewritePlanAtomic = rewritePlanAtomic
               editPlanAtomic = editPlanAtomic
               executeDeliver = executeDeliver
               executeAsk = executeAsk
               executeJsPlan = executeJsPlan
               executeReview = executeReview
               reviewTargetFor = reviewTargetFor
               planRecoveryPosition = planRecoveryPosition
               evaluateRecoveryEffects = evaluateRecoveryEffects
               allWorkViews = allWorkViews
               allWorkViewsFromIntegrator = allWorkViewsFromIntegrator
               latestRetirementRange = latestRetirementRange
               predecessorRange = predecessorRange
               activeOpeningCursor = activeOpeningCursor
               activeStage = activeStage
               retiredCount = retiredCount
               isDelivered = isDelivered
               deliveredDigest = deliveredDigest
               deliveryReceipt = deliveryReceipt
               isActionAllowed = isActionAllowed
               decideAction = decideAction
               allowedPermissions = allowedPermissions
               workOpened = workOpened
               devOpsBound = devOpsBound
               incumbencyOpened = incumbencyOpened
               incumbencyRetired = incumbencyRetired
               delivered = delivered
               reviewed = reviewed
               reopened = reopened
               PlanRetirementOutcome = PlanRetirementOutcome
               PlanReviewedOutcome = PlanReviewedOutcome
               PlanStage = PlanStage |}
