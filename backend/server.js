/*** SOURCES THAT NEED TO BE CREDITED ***/
/*** 
 * Web socket code from https://www.apollographql.com/docs/apollo-server/data/subscriptions/
***/

// const {graphqlHTTP} = require('express-graphql');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require("path");
const session = require('express-session');
const cookie = require('cookie');
const validator = require('validator');
const bcrypt = require('bcrypt');
const enforce = require("express-sslify");
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config({path: __dirname + '/./../.env'});
const {WebSocketServer} = require('ws');
const {useServer} = require('graphql-ws/lib/use/ws');
const { createServer } = require('http');
const {ApolloServer} = require('apollo-server-express');

const db = require('./config/keys').mongoURI;
const Users = require('./database/Model/Users');
const schema = require('./graphql_schema/schema');
const cloudinary = require('./config/cloudinary');
const upload = require('./config/multer');
const context = require('./auth/contextMiddleware');
const { ApolloServerPluginDrainHttpServer } = require('apollo-server-core');

// Calling express server
const app = express();
app.use(bodyParser.json());

// Add cors
app.use(cors());

// Add cookie session
app.use(session({
    secret: 'please change this secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
    }
}));

// Db connection
mongoose
    .connect(db)
    .then(() => {
        console.log("Database connected successfully....");
    })
    .catch((err) => {
        console.log(err);
    });

// GraphQL APIs
// app.use('/graphql', graphqlHTTP({
//     schema: schema,
//     context: contextSub,
//     graphiql: true,
//     subscriptionsEndpoint: subscriptionsEndpoint
// }));

// Display the HTTP request requested on console
app.use(function (req, res, next){
    let username = (req.session.user)? req.session.user.username : '';
    res.setHeader('Set-Cookie', cookie.serialize('username', username, {
        path : '/', 
        maxAge: 60 * 60 * 24 * 7 // 1 week in number of seconds
    }));
    console.log("HTTP request", username, req.method, req.url, req.body);
    next();
});

// Check username for bad inputs
const checkUsername = function(req, res, next) {
    if (!validator.isAlphanumeric(req.body.username)) return res.status(400).end(" Username should be alphabet or numeric");
    next();
};

// Check password for bad inputs
const checkPassword = function(req, res, next) {
    let password = req.body.password;
    const regex = new RegExp("^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$");
    if (!regex.test(password))
    {
        return res.status(400).end("Password should be atleast 1 uppercase and atleast 1 lowercase alphabet, atleast 1 number and atleast 1 of !@#$&*");   
    }
    if(password.length <= 7) return res.status(400).end(" Password should atleast be 8 characters long");
    next();
};

// Signup rest api
app.post('/api/signup', upload.single('profilePicture'), checkUsername, checkPassword, (req, res, err) => {
    // extract data from HTTPS request
    if (!('username' in req.body)) return res.status(400).end('username is missing');
    if (!('password' in req.body)) return res.status(400).end('password is missing');
    if (!('fullName' in req.body)) return res.status(400).end('Full name is missing');
    if (!('email' in req.body)) return res.status(400).end('Email is missing');

    Users.findOne({username: req.body.username})
        .then((checkUser, error) => {
            if(error) return res.status(500).json(error);
            if(checkUser) return res.status(409).json({"error": "Username " + req.body.username + " is already in use"});

            // Avoid repeating email by users
            Users.findOne({email: req.body.email})
                .then((user, error) => {
                    if(error) return res.status(500).json(error);
                    if(user) return res.status(409).json({"error": "Email " + req.body.email + " is already in use"});
                    let pass = req.body.password;
                    // Store password as a hashtable
                    bcrypt.genSalt(10)
                        .then(salt => {
                            bcrypt.hash(pass, salt)
                                .then(async (hashPass) => {
                                    try
                                    {
                                        let profilePicUrl = "";
                                        if (req.file != undefined)
                                        {
                                            let pathFile = req.file.path;
                                            if (pathFile != undefined && pathFile != null && pathFile != "")
                                            {
                                                const picture = await cloudinary.uploader.upload(pathFile, {
                                                    public_id: req.body.username,
                                                    eager: [{ width: 180, height: 180, crop: "scale", quality: "100" }]
                                                });
                                                profilePicUrl = picture.eager[0].secure_url;
                                            }
                                        }
                                        
                                        const userDetails = new Users({
                                            username: req.body.username,
                                            password: hashPass,
                                            fullName: req.body.fullName,
                                            email: req.body.email,
                                            about: req.body.about,
                                            profilePicture: profilePicUrl
                                        });
                                        console.log(userDetails);
                                        userDetails.save()
                                            .then(data => res.json(data))
                                            .catch(error => {
                                                console.log(error);
                                                res.status(500).json({
                                                    error: error
                                                });
                                            });
                                    }
                                    catch(e)
                                    {
                                        console.log(e);
                                        res.status(500).json({
                                            error: e
                                        });
                                    }
                                })
                                .catch(error => {
                                    console.log(error);
                                    res.status(500).json({
                                        error: error
                                    });
                                });
                        })
                        .catch(error => {
                            console.log(error);
                            res.status(500).json({
                                error: error
                            });
                        });
                })
                .catch(error => {
                    console.log(error);
                    res.status(500).json({
                        error: error
                    });
                });
        })
        .catch(err => {
            console.log(err);
            res.status(500).json({
                error: error
            });
        });
});

// Login rest api
app.post('/login', checkUsername, checkPassword, (req, res, err) => {
    // extract data from HTTPS request
    if (!('username' in req.body)) return res.status(400).end('username is missing');
    if (!('password' in req.body)) return res.status(400).end('password is missing');

    let username = req.body.username;
    let password = req.body.password;

    // retrieve user
    Users.findOne({username: username})
        .then(user => {
            console.log(user);
            if (!user) return res.status(401).end("Invalid username or password");
            bcrypt.compare(password, user.password)
                .then(validUser => {
                    if (!validUser) return res.status(401).end("Invalid username or password");

                    // start a session
                    req.session.user = user;
                    res.setHeader('Set-Cookie', cookie.serialize('username', username, {
                        path : '/', 
                        maxAge: 60 * 60 * 24 * 7, // 1 week in number of seconds
                        httpOnly: false,
                        secure: true,
                        sameSite: 'strict'
                   }));
                   const token = jwt.sign({username}, process.env.JSON_SECRET, {expiresIn: 24 * 60 * 60});
                   return res.status(200).json({username: username, token: token, tokenExpiration: 1});
                })
                .catch(error => {
                    console.log(error);
                    throw error;
                });
        })
        .catch(error => {
            console.log(error);
            res.status(500).json({
                error: error
            });
        });
});

// Rest api for sign out
app.get('/signout', function (req, res, next) {
    // destroy session after sign out
    req.session.destroy(function(err){
        if (err) return res.status(500).end(err);
        res.setHeader('Set-Cookie', cookie.serialize('username', '', {
            path : '/', 
            maxAge: 60 * 60 * 24 * 7 // 1 week in number of seconds
      }));
      return res.json("Signout successful");
    }); 
});

// Frontend connect for deployment
if (process.env.NODE_ENV === "production") {
    app.use(enforce.HTTPS({ trustProtoHeader: true }));
    app.use(express.static(path.join(__dirname, "../frontend/build")));
  
    app.get("*", (req, res) =>
      res.sendFile(path.join(__dirname, "../frontend/build/index.html"))
    );
}

const httpServer = createServer(app);
const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql'
});

const socketIO = require('socket.io')(httpServer, {cors: {origin: "http://localhost:3000"}});
socketIO.on("connection", (socket) => {
    socket.emit("myself", socket.id);

    socket.on("disconnect", () => {
		socket.broadcast.emit("callDisconnected")
	});

	socket.on("userCall", (data) => {
		io.to(data.userToCall).emit("userCall", { signal: data.signalData, from: data.from, name: data.name })
	});

	socket.on("answerCall", (data) => {
		io.to(data.to).emit("callAnswered", data.signal)
	});
});

const serverCleanup = useServer({ schema }, wsServer);

let server
async function startServer()
{
    server = new ApolloServer({
        schema,
        context: context,
        plugins: [
            // Shutdown http server
            ApolloServerPluginDrainHttpServer({httpServer}),
            // Shutdown web socket server
            {
                async serverWillStart()
                {
                    return {
                        async drainServer() {
                            await serverCleanup.dispose();
                        },
                    };
                },
            },
        ]
    });
    await server.start();
    server.applyMiddleware({app});
}
startServer();

// Listen localhost server at port 4000
const PORT = 4000;
httpServer.listen(PORT, (err) => {
    if (err) console.log(err);
    else 
    {
        console.log(server.graphqlPath);
        console.log("HTTP server on http://localhost:%s%s", PORT, server.graphqlPath);
    }
});