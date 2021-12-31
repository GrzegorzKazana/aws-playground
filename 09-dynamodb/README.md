## task 09

## goal

Design and deploy dynamoDB table for kanban board type application. Use `aws-sdk` to insert and query the data.

Required access patterns:

-   get all tasks ordered by creation date
-   get tasks in given state (todo/in progress/done)
-   get task details
-   get all task events (e.g. comments, status changes with date)

|       `GSI1-PK`        | Status <br> `GSI1-SK` | TaskId <br> `PK` |       `SK`       | CreatedAt  |   Description    |
| :--------------------: | :-------------------: | :--------------: | :--------------: | :--------: | :--------------: |
| TASK-PARTITION_SCATTER |      IN_PROGRESS      |     task#01      |       DATA       | 2021-12-27 | do this and that |
| TASK-PARTITION_SCATTER |         DONE          |     task#02      |       DATA       | 2021-12-30 | do this and that |
|           -            |           -           |     task#02      | event#CREATED_AT | 2021-12-30 |        -         |

Access patterns

|             pattern              | method | index |    PK     |          SK           |
| :------------------------------: | :----: | :---: | :-------: | :-------------------: |
|         get task details         |  get   |   -   |  TaskId   |         DATA          |
|     get tasks in given state     |  get   | GSI1  | `GSI1-PK` |       `GSI1-SK`       |
| get all ordered by creation date | query  | GSI1  | `GSI1-PK` |           -           |
|       get all task events        | query  |   -   |  TaskId   | begins_with('event#') |

## services

-   _DynamoDB_
