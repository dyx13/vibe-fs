namespace Wanxiangshu.Mission.Planning

module PlanEventTypes =
    let WorkOpened = "PlanWorkOpened"
    let DevOpsBound = "PlanDevOpsBound"
    let IncumbencyOpened = "PlanIncumbencyOpened"
    let IncumbencyRetired = "PlanIncumbencyRetired"
    let Delivered = "PlanDelivered"
    let Reviewed = "PlanReviewed"
    let Reopened = "PlanReopened"

    let all =
        [ WorkOpened
          DevOpsBound
          IncumbencyOpened
          IncumbencyRetired
          Delivered
          Reviewed
          Reopened ]

    let isPlanEvent (eventType: string) : bool = all |> List.contains eventType
