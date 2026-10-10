namespace Wanxiangshu.Mission.Relay.Assessment

open Wanxiangshu.Mission.Relay

module Model =
    val schemaJson: string
    val tryParse: obj -> Result<AssessmentFindings, string>
