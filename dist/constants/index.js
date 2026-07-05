"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityType = exports.SyncOperationStatus = exports.SyncOperationType = exports.RoomStatus = exports.BookingStatus = void 0;
var BookingStatus;
(function (BookingStatus) {
    BookingStatus["RESERVED"] = "RESERVED";
    BookingStatus["CHECKED_IN"] = "CHECKED_IN";
    BookingStatus["CHECKED_OUT"] = "CHECKED_OUT";
    BookingStatus["CANCELLED"] = "CANCELLED";
})(BookingStatus || (exports.BookingStatus = BookingStatus = {}));
var RoomStatus;
(function (RoomStatus) {
    RoomStatus["AVAILABLE"] = "AVAILABLE";
    RoomStatus["OCCUPIED"] = "OCCUPIED";
    RoomStatus["RESERVED"] = "RESERVED";
    RoomStatus["CLEANING"] = "CLEANING";
    RoomStatus["MAINTENANCE"] = "MAINTENANCE";
})(RoomStatus || (exports.RoomStatus = RoomStatus = {}));
var SyncOperationType;
(function (SyncOperationType) {
    SyncOperationType["INSERT"] = "INSERT";
    SyncOperationType["UPDATE"] = "UPDATE";
    SyncOperationType["DELETE"] = "DELETE";
})(SyncOperationType || (exports.SyncOperationType = SyncOperationType = {}));
var SyncOperationStatus;
(function (SyncOperationStatus) {
    SyncOperationStatus["PENDING"] = "PENDING";
    SyncOperationStatus["SUCCESS"] = "SUCCESS";
    SyncOperationStatus["CONFLICT"] = "CONFLICT";
    SyncOperationStatus["FAILED"] = "FAILED";
})(SyncOperationStatus || (exports.SyncOperationStatus = SyncOperationStatus = {}));
var EntityType;
(function (EntityType) {
    EntityType["CUSTOMER"] = "CUSTOMER";
    EntityType["BOOKING"] = "BOOKING";
    EntityType["CHECKIN"] = "CHECKIN";
    EntityType["ROOM"] = "ROOM";
    EntityType["PAYMENT"] = "PAYMENT";
})(EntityType || (exports.EntityType = EntityType = {}));
