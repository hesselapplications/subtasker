import Vue from "vue"
import Vuex from "vuex"
import taskUtils from "@/taskUtils.js"
import { vuexfireMutations, firestoreAction } from "vuexfire"
import firebase from "@/firebase.js";
import _ from "lodash";

Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    tasksLoaded: false,
    tasks: []
  },
  mutations: {
    ...vuexfireMutations
  },
  actions: {
    // Bind firestore
    bindFirestore: firestoreAction(async ({ state, bindFirestoreRef }) => {
      await bindFirestoreRef("tasks", firebase.tasks)
      state.tasksLoaded = true
    }),

    // Unbind firestore
    unbindFirestore: firestoreAction(async ({ state, unbindFirestoreRef }) => {
      await unbindFirestoreRef ("tasks")
      state.tasksLoaded = false
    }),

    // Save task
    saveTask: firestoreAction(async ({ getters, dispatch }, task) => {
      if (task == null) {
        return;
      }

      var treeMap = getters.taskTreeMap;
      var existingTask = taskUtils.getNode(treeMap, task.id);
      existingTask = _.cloneDeep(existingTask)
      task = _.cloneDeep(task)

      if (taskUtils.hasChildren(existingTask)) {
        task.complete = taskUtils
          .getChildren(existingTask)
          .every(child => child.complete);

        delete task.inSprint
      }

      existingTask = taskUtils.stripInvalidProperties(existingTask);
      task = taskUtils.stripInvalidProperties(task);

      if (_.isEqual(task, existingTask)) {
        return;
      }

      await firebase.saveDocument(firebase.tasks, task);

      var parent = taskUtils.getParent(treeMap, task);
      await dispatch("saveTask", parent);
    }),

    // Delete task
    deleteTask: firestoreAction((context, task) => {
      taskUtils.flattenTree(task)
        .map(task => task.id)
        .forEach(id => firebase.deleteDocument(firebase.tasks, id));
    }),

    // Delete completed
    deleteCompleted: firestoreAction(async ({ dispatch }, task) => {
      var rootId = task.id;
      var promises = taskUtils.flattenTree(task)
        .filter(task => task.id != rootId)
        .filter(task => task.complete)
        .map(task => dispatch("deleteTask", task));
      
      await Promise.all(promises);
    }),

    // Mark complete
    markComplete: firestoreAction(async ({ dispatch }, {task, complete}) => {
      var promises = taskUtils
        .flattenTree(task)
        .map(_.cloneDeep)
        .map(task => {
          task.complete = complete;
          return dispatch("saveTask", task);
        });
        
      await Promise.all(promises);
    }),

    // Toggle complete
    toggleComplete: firestoreAction(async ({ dispatch }, task) => {
      var payload = {
        task: task,
        complete: !task.complete
      };

      await dispatch("markComplete", payload)
    }),

    // Add to sprint
    addToSprint: firestoreAction(async ({ dispatch }, task) => {
      task = _.cloneDeep(task);
      task.inSprint = true;
      await dispatch("saveTask", task);
    }),

    // Remove from sprint
    removeFromSprint: firestoreAction(async ({ dispatch }, task) => {
      task = _.cloneDeep(task)
      task.inSprint = false;
      await dispatch("saveTask", task);
    }),
  },
  modules: {},
  getters: {
    taskTrees: state => {
      var tasks = state.tasks
        .map(task => ({
          id: task.id,
          ...task
        }));
      
      return taskUtils.buildTrees(tasks);
    },
    taskTreeMap: (state, getters) => {
      return taskUtils.buildTreeMap(getters.taskTrees);
    },
    sprintTrees: (state, getters) => {
      return state.tasks
        .filter(task => task.inSprint)
        .map(task => getters.getTaskWithId(task.id));
    },
    getTaskWithId: (state, getters) => id => {
      return taskUtils.getNode(getters.taskTreeMap, id);
    },
    getTaskPath: (state, getters) => id => {
      var task = getters.getTaskWithId(id);
      return taskUtils.getPath(getters.taskTreeMap, task);
    },

  }
})