const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDB = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
  }
};

initializeDB();

//Register API

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `
    select * from
    user where username='${username}';`;
  const selectUser = await db.get(selectUserQuery);
  if (selectUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashPassword = await bcrypt.hash(password, 10);
      const insertUserQuery = `
            insert into user(name,username,password,gender)
            values('${name}','${username}','${hashPassword}','${gender}');`;
      const insertUser = await db.run(insertUserQuery);
      response.send("User created successfully");
    }
  }
});

//Login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    select * from
    user where username='${username}';`;
  const selectUser = await db.get(selectUserQuery);
  if (selectUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const compPass = await bcrypt.compare(password, selectUser.password);

    if (compPass === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      let jwtToken;
      const payload = { username: username };
      jwtToken = jwt.sign(payload, "asdf");
      response.send({ jwtToken });
    }
  }
});

//Authenticate token middleware function

const authenticateToken = async (request, response, next) => {
  const authObj = request.headers.authorization;
  if (authObj === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    let jwtToken;
    jwtToken = authObj.split(" ")[1];
    jwt.verify(jwtToken, "asdf", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//get tweet feed API

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  console.log(username);
  const getFeedQuery = `
    select u.username,
    t.tweet,t.date_time as dateTime
    from user u natural
    join tweet t
    where t.user_id in (
     select following_user_id
     from follower 
     where follower_user_id=(select user_id
        from user where
        username='${username}' )  
    )order by t.date_time desc
    limit 4;`;
  const getFeed = await db.all(getFeedQuery);
  response.send(getFeed);
});

//get following list API

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getFollowingListQuery = `
    select name  
    from user where 
    user_id in (select
        following_user_id
        from follower where
        follower_user_id=(
            select user_id from user
            where username='${username}'
        ));`;
  const getFollowingList = await db.all(getFollowingListQuery);
  response.send(getFollowingList);
});

//get followers list API

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getFollowersListQuery = `
        select name  
        from user where 
        user_id in (select
            follower_user_id
            from follower where
            following_user_id=(
                select user_id from user
                where username='${username}'
            ));`;
  const getFollowersList = await db.all(getFollowersListQuery);
  response.send(getFollowersList);
});

//get tweet API

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getFollowingListQuery = `
        select user_id  
        from user where 
        user_id in (select
            following_user_id
            from follower where
            follower_user_id=(
                select user_id from user
                where username='${username}'
            ));`;
  const getFollowingList = await db.all(getFollowingListQuery);
  const getFollowingIdList = [];
  for (let i of getFollowingList) {
    getFollowingIdList.push(i.user_id);
  }

  const getUserIdFromTweetIdQuery = `
  select user_id from 
  tweet where tweet_id=${tweetId};`;
  const getUserIdFromTweetId = await db.get(getUserIdFromTweetIdQuery);

  if (getFollowingIdList.includes(getUserIdFromTweetId.user_id) === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getLikesCountQuery = `
    select count(*) as likes from 
    like where tweet_id=${tweetId};`;
    const getLikesCount = await db.get(getLikesCountQuery);
    const getRepliesCountQuery = `
    select count(*) as replies
    from reply where 
    tweet_id=${tweetId};`;
    const getRepliesCount = await db.get(getRepliesCountQuery);
    const getTweetDetailsQuery = `
    select tweet,date_time
    as dateTime from tweet
    where tweet_id=${tweetId};`;
    const getTweetDetails = await db.get(getTweetDetailsQuery);
    response.send({
      tweet: getTweetDetails.tweet,
      likes: getLikesCount.likes,
      replies: getRepliesCount.replies,
      dateTime: getTweetDetails.dateTime,
    });
  }
});

//get person who like tweet API

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getFollowingListQuery = `
                select user_id  
                from user where 
                user_id in (select
                    following_user_id
                    from follower where
                    follower_user_id=(
                        select user_id from user
                        where username='${username}'
                    ));`;
    const getFollowingList = await db.all(getFollowingListQuery);
    const getFollowingIdList = [];
    for (let i of getFollowingList) {
      getFollowingIdList.push(i.user_id);
    }

    const getUserIdFromTweetIdQuery = `
        select user_id from 
        tweet where tweet_id=${tweetId};`;
    const getUserIdFromTweetId = await db.get(getUserIdFromTweetIdQuery);

    if (
      getFollowingIdList.includes(parseInt(getUserIdFromTweetId.user_id)) ===
      false
    ) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likesNamesQuery = `select name
            from user where
            user_id in (
                select user_id 
                from like where
                tweet_id=${tweetId}
            );`;
      const likesNames = await db.all(likesNamesQuery);
      const listNames = [];
      for (let i of likesNames) {
        listNames.push(i.name);
      }
      response.send({ likes: listNames });
    }
  }
);

//get replies on a tweet API

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getFollowingListQuery = `
                select user_id  
                from user where 
                user_id in (select
                    following_user_id
                    from follower where
                    follower_user_id=(
                        select user_id from user
                        where username='${username}'
                    ));`;
    const getFollowingList = await db.all(getFollowingListQuery);
    const getFollowingIdList = [];
    for (let i of getFollowingList) {
      getFollowingIdList.push(i.user_id);
    }

    const getUserIdFromTweetIdQuery = `
        select user_id from 
        tweet where tweet_id=${tweetId};`;
    const getUserIdFromTweetId = await db.get(getUserIdFromTweetIdQuery);

    if (getFollowingIdList.includes(getUserIdFromTweetId.user_id) === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const repliesNameQuery = `
        select name,reply from 

        user u natural join reply r
        where tweet_id=${tweetId};`;

      const repliesName = await db.all(repliesNameQuery);
      response.send({ replies: repliesName });
    }
  }
);

//tweets of a user API

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getTweetsQuery = `
    select tweet,
     date_time 
    as dateTime from 
    tweet where   
    user_id=(select user_id
        from user where 
        username='${username}');`;
  const getTweets = await db.all(getTweetsQuery);
  const ansList = [];
  for (let i of getTweets) {
    const getLikesCountQuery = `
      select count(like_id) as likes from 
      like where
      tweet_id=(select tweet_id from tweet
        where tweet='${i.tweet}');`;
    const getLikesCount = await db.get(getLikesCountQuery);
    const getRepliesCountQuery = `
      select count(reply_id) as replies from 
      reply where
      tweet_id=(select tweet_id from tweet
        where tweet='${i.tweet}');`;
    const getRepliesCount = await db.get(getRepliesCountQuery);
    ansList.push({
      tweet: i.tweet,
      likes: getLikesCount.likes,
      replies: getRepliesCount.replies,
      dateTime: i.dateTime,
    });
  }
  response.send(ansList);
});

//post tweet API

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const now = new Date();
  const { tweet } = request.body;
  const getUserIdQuery = `
    select user_id from 
    user where username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const postTweetQuery = `
    insert into tweet(tweet,user_id,date_time)
    values ('${tweet}','${userId.user_id}','${now}')`;
  const postTweet = await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//delete tweet API

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const { username } = request;
    const tweetIdListQuery = `
    select tweet_id
    from tweet where user_id
    =(select user_id from user
        where username='${username}');`;
    const tweetIdList = await db.all(tweetIdListQuery);
    let tweetsIds = [];
    for (let i of tweetIdList) {
      tweetsIds.push(i.tweet_id);
    }

    if (tweetsIds.includes(parseInt(tweetId)) === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        delete from tweet
        where tweet_id=${tweetId};`;
      const deleteTweet = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
