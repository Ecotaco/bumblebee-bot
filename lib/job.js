const kue = require('kue');
const trip = require('./trip');
const io = require('./socket');
const Bot = require('../models/bot');
const queue = kue.createQueue({
  redis: process.env.REDIS_URL
});

queue.process('destroy_bot', function(job, done) {
  job_destroy_bot(job.data.id_bot, done);
});

const job_destroy_bot = function(id_bot, done) {
  Bot.remove({ _id: id_bot })
  .then(function(result) {
    io.emit('bot_deactivate', {id_bot: bot.id});
    done();
  })
  .catch(function(err) {
    console.error(err);
    done();
  });
};

queue.process('driver_movement', function(job, done) {
  job_driver_movement(job.data.id_driver, job.data.step_index, job.data.position, done);
});

const job_driver_movement = function(id_driver, step_index, position, done) {
  io.emit('notification', { id: id_driver, position: position});
  done();
};

queue.process('driver_new_trip', function(job, done) {
  job_driver_new_trip(job.data.id_driver, job.data.position, done);
});

const job_driver_new_trip = function(id_driver, origin, done) {
  Bot.findOne({ drivers: id_driver })
  .exec()
  .then(function(bot) {
    if(bot.active) {
      var current_delay = bot.precision;
      trip.generate_trip(bot, origin, function(steps) {
        io.emit('trip', { id: bot.id, ride: steps});
        var last_step_index = steps.length - 1;

        steps.forEach(function(step, index) {
          queue.create('driver_movement', {
            id_driver: id_driver,
            position: step,
            step_index: index
          })
          .delay(current_delay)
          .removeOnComplete(true)
          .save();

          if(index === last_step_index) {
            queue.create('driver_new_trip', {
              id_driver: id_driver,
              position: step
            })
            .delay(current_delay)
            // .removeOnComplete(true)
            .save();
          }
          current_delay += bot.precision;
        });
        done();
      });
    } else {
      io.emit('bot_deactivate', {id_bot: bot.id, id_driver: id_driver});
      done();
    }
  })
  .catch(function(err) {
    console.error(err);
    done();
  });
};

job = {};

job.driver_new_trip = function(id_bot, id_driver) {
  queue.create('driver_new_trip', {
    id_driver: id_driver
  })
  .save();

  queue.create('destroy_bot', {
    id_bot: id_bot
  })
  .delay(30*60*1000)
  .save();
}

module.exports = job;
