# TASKQUEUE

Single-writer: solo `queue-run` (el orquestador del loop) y el Gate humano
escriben esta tabla. Ningun builder la toca.

Estados: `todo` → `building` → `review` → `done` (o `stopped`).

| Id | Estado | Lane | Dueño | Rama | Plan | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| XR-001 | building | amplio | sesion XR-001 | `xr/XR-001-mock-dataset` | `plans/XR-001-mock-dataset/PLAN.md` | — |
