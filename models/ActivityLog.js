const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: [true, "Action is required"],
      enum: ["create", "update", "delete", "assign", "status"],
      trim: true
    },
    entity: {
      type: String,
      enum: ["task", "team", "user"],
      required: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    details: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true,
    // Define the collection as capped
    capped: {
      size: 16384, // The size of the collection in bytes. 16KB should be plenty for 25 logs.
      max: 25 // The maximum number of documents in the collection.
    }
  }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
