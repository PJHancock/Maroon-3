When opening the app for the first time (for a new user) it should ask the user if they want to start by adding a desired job or company, or if they want to start out networking in general to find new connections. Based on the user's choice, it will create an initial task list with items related to their choice, such as contacting someone new every week, researching tools or libraries a company uses, starting and working on a related personal project, schedule an informational interview, go to an event, etc.

Every time the user completes a task, they should save a note about how it went, specifically who they contacted. That way the app will make new tasks for them such as reminders to follow up. 

Instead of giving the user an example message to send, it should give the user suggestions of what to ask, like "you could ask them about ___ or ___". That way the user's communications are actually theirs, and not just from an LLM. Currently the UI has a copy button when clicking on a follow up task, it will need to be changed to have a suggestion instead and a completed button.

Tasks should be created by the agent making tool calls. The agent can use context and propose new tasks, and the user can accept or reject them. For example the user can choose if they are daily or weekly.

Tasks should also include networking skills that are in the plan. The focus of the app is to get the user to network to progress towards finding a job.