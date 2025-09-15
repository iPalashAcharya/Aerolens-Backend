const catchAsync = (fn) => { //utility in express apps to handle async errors cleanly, fn is an asynchronous route handler or middleware
    return (req, res, next) => { //returns a new function
        fn(req, res, next).catch(next); //calls the fn function and if the fn function has an error inside it, then .catch(next) passes the error to the "next" function
    };
};

module.exports = catchAsync;

/*
used to make code shorter
usually you do:

app.get('/users', async (req, res, next) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    next(err); // must call next() manually on error
  }
}); 

but with the above utility function,:
app.get('/users', catchAsync(async (req, res, next) => {
  const users = await User.find();
  res.json(users);
}));
No need for try/catch everywhere.
Any thrown error automatically goes to your global error handling middleware.*/