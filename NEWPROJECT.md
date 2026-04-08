I want to work on a system and will be explaining everything in this report - 


First, I want 3 types of logins - 
Admin
Backend Manager
Backend Assist
Calling Assist

In the menu, there is going to be - 

 Dashboard (Different Views based on logins)
Master (Only visible to Admin and Backend Manager)
Programs Name with Mentor Name
It can contain the program Name and the mentor's name. (Example - Digital Wealth Domination and Mentor is Deepak Choudhary; Algorithm Trading and Mentor is Siddarth Kapoor)
Levels Name 
 Levels are going to be under every program, like (Level 0, Level 1)
Under every level, there are going to be batches - like Batch 001 and batch details like - (Batch name/number, batch name, start date/month, end date/month and remarks)
Make sure under one program level there can be multiple batches
In the batch i need option to add calls like -
10th Jan - 1st Day Call
11th Jan - 2nd Day Call
11th Jan - Doubt Session Call
(On a single date, multiple calls can be there)
Custom Fields option which is going to be assigned

NOTE - Now most important logic - 

Let’s say i created a program - “business using AI” and created a level 1 in it and under it i created batch 001 having 50 leads. (Leads will come through api or i can import them in there, just name, email an phone number)
And i want the leads to be equally distributed under backend assist. If there are 2 backend assist login, leads will be distributed automatically.

I will be creating the calls under batch like - 

10th Jan - 1st Day Call
11th Jan -2nd Day Call
11th Jan - 3rd Day call

So the table will be created automatically with headers like - 

Sr. No. ; Name ; Email ; Phone Number ; Handlers Name (Basically the backend assist name assigned to that lead) ;; then date of the calls header and under every date, i need headers like - Registration report,Calling assist report, Handlers report and custom field if any.


Calling assist will be having the values - 

Ring-NR
Voice Mail-NR
Out Of Service-NR
Switched Off-NR
Busy
Disconnected-NR
Incoming Inactive-NR
Out Of Reach/Network-NR
Won't Attend-NR
Message Sent
Will Attend/Will join


And handler will be having the dropdown with value - 

Ring-NR
Voice Mail-NR
Out Of Service-NR
Switched Off-NR
Busy
Disconnected-NR
Incoming Inactive-NR
Out Of Reach/Network-NR
Won't Attend-NR
Message Sent
Will Attend/Will join
Call Them


This all will be having a page something like Assign Data or something 

In this based on login user will see data in tables format, like calling assist will see data - (Name, Phone Number) and will update values from dropdown like - 

Ring-NR
Voice Mail-NR
Out Of Service-NR
Switched Off-NR
Busy
Disconnected-NR
Incoming Inactive-NR
Out Of Reach/Network-NR
Won't Attend-NR
Message Sent
Will Attend/Will join
CALL THEM

(Also, in the master’s, I want a control so I can arrange these fields or rename them)

Backend assist will see 



Notes - 

Hashed Passwords for security
Auto-logout after session expires
Remember me will save the session in the browser and will expire after some time
Firebase login for approved secutiy
I want api’s / webhooks so i can send data inside and can send data outside also and it needs to be secure but can connect with apps like Pablly/Zapier.
Also, make sure to make it module wise so the implementation or changes are gonna be easy and understand the scope of project. 
For logins we will use firebase authentication
UI needs to be very modern with glassmorphism style and i want everything to be in module basis so we can edit or remove features lately.
U can decide the languages to use and code to use. On vercel free account i will be deployin this for now, so need readme file with steps to deploy. 
It needs to be fast and changes needs to be updated live mostly without refresh so either react or vue you can use. All upto you,
