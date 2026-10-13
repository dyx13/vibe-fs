namespace Wanxiangshu.Mission.Planning

open System

type ActiveTenureInfo =
    { WorkId: string
      IncumbencyId: string
      Stage: string
      OpeningCursor: int64
      PreviousRange: (int64 * int64) option
      IsFreshHandover: bool }

type TenureMessage =
    { Id: string option
      Role: string
      IsSynthetic: bool
      HasSemanticParts: bool
      Raw: obj }

type TenureAssemblyResult =
    { Messages: obj list
      ReanchorRequested: bool }

module TenureIsolation =

    let private recordMessage (tenure: ActiveTenureInfo) (text: string) : obj =
        box
            {| info =
                {| id = "lwr-prev-" + tenure.IncumbencyId
                   sessionID = tenure.WorkId
                   role = "user"
                   synthetic = true
                   source = "plan-tenure-record" |}
               parts = [| box {| ``type`` = "text"; text = text |} |] |}

    let private physicalCursor (messageCursors: Map<string, int64>) (message: TenureMessage) =
        message.Id
        |> Option.bind (fun messageId -> Map.tryFind messageId messageCursors)

    /// Ownership of one assistant/tool exchange: its first canonical
    /// observation must sit strictly after the tenure opening. A semantic
    /// exchange without canonical identity is a contract violation, never a
    /// silent drop or a silent keep.
    let private keepsInteraction (tenure: ActiveTenureInfo) cursor (hasSemanticParts: bool) =
        match cursor with
        | Some sequence -> sequence > tenure.OpeningCursor
        | None when not hasSemanticParts -> false
        | None -> invalidOp "Plan interaction has no stable XTrace message identity"

    let private keepMessage (tenure: ActiveTenureInfo) cursor (message: TenureMessage) =
        match message.IsSynthetic, message.Role with
        | true, _ -> false
        | false, "user" -> true
        | false, "assistant"
        | false, "tool" -> keepsInteraction tenure cursor message.HasSemanticParts
        | false, _ -> false

    let private validateTenure (tenure: ActiveTenureInfo) =
        if tenure.OpeningCursor < 0L then
            invalidArg (nameof tenure) "Plan opening cursor cannot be negative"

        match tenure.PreviousRange with
        | Some(startCursor, endCursor) when startCursor < 0L || endCursor < startCursor ->
            invalidArg (nameof tenure) "Plan previous range is invalid"
        | _ -> ()

    let private recordText (previousRecord: string option) =
        match previousRecord with
        | Some text when not (String.IsNullOrWhiteSpace text) -> text
        | _ -> invalidOp "Plan previous work record is unavailable"

    let private previousRecordMessage (tenure: ActiveTenureInfo) (previousRecord: string option) =
        match tenure.PreviousRange with
        | Some(startCursor, endCursor) when endCursor > startCursor ->
            Some(recordMessage tenure (recordText previousRecord))
        | _ -> None

    let private placeBeforeCurrent
        (tenure: ActiveTenureInfo)
        (reversed: obj list)
        (pendingRecord: obj option)
        (cursor: int64 option)
        (raw: obj)
        : obj list * obj option =
        match pendingRecord, cursor with
        | Some record, Some sequence when sequence > tenure.OpeningCursor -> raw :: record :: reversed, None
        | _ -> raw :: reversed, pendingRecord

    let private step
        (tenure: ActiveTenureInfo)
        (messageCursors: Map<string, int64>)
        (state: obj list * obj option)
        (message: TenureMessage)
        : obj list * obj option =
        let cursor = physicalCursor messageCursors message

        if keepMessage tenure cursor message then
            let reversed, pendingRecord = state
            placeBeforeCurrent tenure reversed pendingRecord cursor message.Raw
        else
            state

    /// A record that never met a current physical message (the tenure made no
    /// interaction yet) lands after the retained historical U.
    let private finish (reversed: obj list) (pendingRecord: obj option) : obj list =
        match pendingRecord with
        | Some record -> List.rev (record :: reversed)
        | None -> List.rev reversed

    let assemble
        (messages: TenureMessage list)
        (tenure: ActiveTenureInfo)
        (messageCursors: Map<string, int64>)
        (previousRecord: string option)
        : TenureAssemblyResult =
        validateTenure tenure

        let reversed, pendingRecord =
            List.fold (step tenure messageCursors) ([], previousRecordMessage tenure previousRecord) messages

        { Messages = finish reversed pendingRecord
          ReanchorRequested = tenure.IsFreshHandover }
