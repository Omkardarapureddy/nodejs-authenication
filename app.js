const express = require("express");
const { open } = require("sqlite");
const app = express();
app.use(express.json());
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
let db = null;
const dbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running http://localhost:3000/");
    });
  } catch (e) {
    console.log("DB error:${e.message}");
    process.exit(1);
  }
};
dbAndServer();

/*const getFollowingUserId = async (username) => {
  const getFOllowingPepole = `SELECT * FROM follower INNER JOIN user ON follower.follower_user_id=user.user_id WHERE user.username="${username}"`;
  const followingPeople = await db.all(getFOllowingPepole);
  const arrayOfIds = followingPeople.map((each) => each.following_user_id);
  return arrayOfIds;
};*/

app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username,password, name, gender) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}', 
          '${name}',
          '${gender}'
        )`;
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      let newUserDetails = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(username, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload;
        next();
      }
    });
  }
};
const objList = (changeObj) => {
  return {
    username: changeObj.username,
    tweet: changeObj.tweet,
    dateTime: changeObj.date_time,
  };
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getFeed = await db.all(`SELECT tweet.tweet_id,tweet.user_id,user.username,tweet.tweet,tweet.date_time  FROM follower LEFT JOIN tweet ON follower.following_user_id=tweet.user_id  Left JOIN user ON user.user_id=follower.following_user_id WHERE follower.follower_user_id=(SELECT user_id FROM user WHERE username="${request.username}")
  ORDER BY tweet.date_time DESC LIMIT 4`);
  response.send(getFeed.map((each) => objList(each)));
});
app.get("/user/following/", authenticateToken, async (request, response) => {
  const followings = await db.all(
    `SELECT user.name FROM follower Left JOIN user ON user.user_id=follower.following_user_id WHERE follower.follower_user_id=(SELECT user_id FROM user WHERE username="${request.username}")`
  );
  response.send(followings);
});
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const followers = await db.all(
    `SELECT user.name FROM follower Left JOIN user ON user.user_id=follower.follower_user_id WHERE follower.following_user_id=(SELECT user_id FROM user WHERE username="${request.username}")`
  );
  response.send(followers);
});

const follows = async (request, response, next) => {
  const { tweetId } = request.params;
  let isFollowing = await db.get(
    `SELECT * FROM follower WHERE follower_user_id=(SELECT user_id FROM user WHERE username="${request.username}") AND following_user_id=(SELECT user.user_id FROM tweet NATURAL JOIN user WHERE tweet_id=${tweetId})`
  );
  if (isFollowing === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const { tweet, date_time } = await db.get(
      `SELECT tweet,date_time FROM tweet WHERE tweet_id=${tweetId}`
    );
    const { likes } = await db.get(
      `SELECT count(like_id) AS likes FROM like WHERE tweet_id=${tweetId}`
    );
    const { replies } = await db.get(
      `SELECT count(reply_id) AS replies FROM reply WHERE tweet_id=${tweetId}`
    );
    response.send({ tweet, likes, replies, dateTime: date_time });
  }
);

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const likeBy = await db.all(
      `SELECT user.username  FROM like NATURAL JOIN user WHERE tweet_id=${tweetId}`
    );

    response.send({ likes: likeBy.map((item) => item.username) });
  }
);

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const replies = await db.all(
      `SELECT user.name,reply.reply  FROM reply NATURAL JOIN user WHERE tweet_id=${tweetId}`
    );

    response.send({ replies });
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const myTweet = await db.all(
    `SELECT tweet.tweet,COUNT(DISTINCT like.like_id) AS likes,COUNT(DISTINCT reply.reply_id) AS replies,tweet.date_time FROM tweet LEFT JOIN like ON tweet.tweet_id=like.tweet_id LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id WHERE tweet.user_id=(SELECT user_id FROM user WHERE username="${request.username}") GROUP BY tweet.tweet_id `
  );
  response.send(
    myTweet.map((each) => {
      const { date_time, ...rest } = each;
      return { ...rest, dateTime: date_time };
    })
  );
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { user_id } = await db.get(
    `SELECT user_id FROM user WHERE username="${request.username}"`
  );
  await db.run(
    `INSERT INTO tweet (tweet,user_id) VALUES ("${tweet}",${user_id})`
  );
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const userTweet = await db.get(
      `SELECT tweet_id,user_id FROM tweet WHERE tweet_id=${tweetId} AND user_id=(SELECT user_id FROM user WHERE username="${request.username}")`
    );
    if (userTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      await db.run(`DELETE FROM tweet WHERE tweet_id=${tweetId}`);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
