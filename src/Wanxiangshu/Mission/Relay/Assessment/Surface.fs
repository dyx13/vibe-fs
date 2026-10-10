namespace Wanxiangshu.Mission.Relay.Assessment

open Fable.Core.JsInterop
open Wanxiangshu.Mission.Relay

module Surface =
    let schemaJson = Model.schemaJson

    let private findingObject (finding: AssessmentFinding) =
        box
            {| acceptance_criteria = finding.AcceptanceCriteria
               work_plan = finding.WorkPlan |}

    let parse (value: obj) =
        match Model.tryParse value with
        | Error error -> box {| ok = false; error = error |}
        | Ok findings ->
            let values = AssessmentFindings.values findings

            box
                {| ok = true
                   findings = values |> List.map findingObject |> List.toArray
                   passed = AssessmentFindings.isEmpty findings |}
